// Validación de FORMA del contenido, en runtime.
//
// P-08 — la superficie sin protección más grande que quedaba. `lib/blocks.ts`
// describe cada bloque con tipos de TypeScript, pero TypeScript se borra al
// compilar: el navegador puede mandar cualquier objeto a `profile_blocks.content`
// y a `publish_profile`, que hasta la migración 0010 solo comprobaba que el
// arreglo fuera un arreglo. `block_type` y `position_index` entraban sin mirar.
//
// Esta es la capa de código; la capa de base son los `check` de 0010. Si una
// falla, la otra sostiene (defensa en profundidad).
//
// ─── CRITERIO DE DISEÑO, y es el que más importa ───────────────────────────
// El riesgo número uno de esta fase es un validador demasiado estricto que
// rechace perfiles reales y rompa la publicación. Por eso valida **forma, no
// contenido**:
//
//   • Sí valida: el tipo de bloque existe, `content` es un objeto, la posición
//     es un entero no negativo, el tamaño y la profundidad están acotados, y
//     ningún campo de enlace lleva un esquema peligroso.
//   • NO valida: qué campos tiene cada tipo de bloque, ni sus tipos internos.
//     De eso ya se encarga `normalizeBlockData()`, que coacciona cualquier
//     entrada a una forma renderizable y lleva años en producción haciéndolo.
//     Duplicar esa lógica aquí sería justamente el validador estricto que
//     rechaza contenido histórico legítimo.
//
// Sin librería nueva: todo lo de arriba se expresa en unas pocas funciones
// puras y probadas. Añadir `zod` habría sumado peso al bundle sin resolver
// nada que no resuelvan estas ~120 líneas.

import { KNOWN_BLOCK_TYPES } from "./blocks"
import { isSafeUrl, URL_FIELD_NAMES } from "./safe-url"

/** La lista canónica, como `Set` para consultarla en O(1). */
export const TIPOS_DE_BLOQUE_VALIDOS: ReadonlySet<string> = new Set<string>(KNOWN_BLOCK_TYPES)

/** Un bloque suelto no debería pasar de esto ni en el perfil más cargado. */
export const MAX_BYTES_POR_BLOQUE = 512 * 1024
/** Techo del lote entero que va a `publish_profile`. */
export const MAX_BYTES_POR_LOTE = 4 * 1024 * 1024
/** Un JSONB más hondo que esto no lo produce el editor: es ruido o un ataque. */
export const MAX_PROFUNDIDAD = 12
/** Ningún perfil real se acerca; frena un lote generado por script. */
export const MAX_BLOQUES_POR_LOTE = 200

// Claves que terminan en un `href` navegable. Se reutiliza LA MISMA lista que
// `sanitizeUrlFields` aplica al publicar (lib/safe-url.ts): si aquí hubiera un
// conjunto distinto, una capa rechazaría lo que la otra sanea, que es
// exactamente el tipo de divergencia que rompe la publicación de perfiles
// reales.
const CLAVES_DE_ENLACE = URL_FIELD_NAMES

// Claves de MEDIA (van a <img>, <audio>, <video> o al src de un iframe, no a
// un href). `safe-url.ts` las excluye a propósito del saneador de enlaces
// porque `data:image/...` y las URLs de R2 son legítimas ahí y pasarlas por
// `isSafeUrl` rompería contenido válido.
//
// Aun así, tres esquemas no tienen ningún uso legítimo en un campo de media, y
// bloquearlos no puede rechazar nada real. Es una comprobación estrecha a
// propósito: la lista de lo prohibido, no la de lo permitido.
const CLAVES_DE_MEDIA = new Set([
  "image",
  "banner",
  "cover",
  "audioUrl",
  "thumbnailUrl",
  "embedUrl",
  "photo",
  "thumbnail",
  "videoUrl",
])

const ESQUEMAS_PROHIBIDOS = ["javascript:", "vbscript:", "data:text/html"]

/** Quita caracteres de control, el truco clásico para colar `java\tscript:`. */
function normalizarEsquema(valor: string): string {
  let salida = ""
  for (const c of valor) {
    const code = c.charCodeAt(0)
    if (code >= 0x20 && code !== 0x7f) salida += c
  }
  return salida.trim().toLowerCase()
}

function esquemaProhibido(valor: string): boolean {
  const v = normalizarEsquema(valor)
  return ESQUEMAS_PROHIBIDOS.some((e) => v.startsWith(e))
}

/** La forma exacta en que un bloque viaja a `publish_profile`. */
export type BloqueParaPersistir = {
  block_type: unknown
  position_index: unknown
  content: unknown
}

export type ResultadoValidacion = { ok: true } | { ok: false; errores: string[] }

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Profundidad de anidamiento del valor. Corta en `tope` para no recorrer de más. */
export function profundidad(valor: unknown, tope = MAX_PROFUNDIDAD + 1, nivel = 0): number {
  if (nivel >= tope) return nivel
  if (Array.isArray(valor)) {
    let max = nivel
    for (const v of valor) max = Math.max(max, profundidad(v, tope, nivel + 1))
    return max
  }
  if (esObjetoPlano(valor)) {
    let max = nivel
    for (const v of Object.values(valor)) max = Math.max(max, profundidad(v, tope, nivel + 1))
    return max
  }
  return nivel
}

/**
 * Recorre el contenido buscando un enlace con esquema peligroso
 * (`javascript:`, `data:text/html`, `vbscript:`) en una clave que el render
 * trate como URL. `lib/safe-url.ts` ya los neutraliza al pintar; esto los
 * frena una capa antes, al guardar, que es donde no deberían haber entrado.
 */
export function enlacesPeligrosos(valor: unknown, ruta = "content", encontrados: string[] = []): string[] {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => enlacesPeligrosos(v, `${ruta}[${i}]`, encontrados))
    return encontrados
  }
  if (!esObjetoPlano(valor)) return encontrados

  for (const [clave, v] of Object.entries(valor)) {
    const rutaHija = `${ruta}.${clave}`

    if (typeof v === "string" && v.trim() !== "") {
      // Campo de enlace: tiene que pasar el mismo filtro que aplica
      // `sanitizeUrlFields` al publicar (https, http, mailto, tel, relativa).
      if (CLAVES_DE_ENLACE.has(clave)) {
        if (!isSafeUrl(v)) encontrados.push(rutaHija)
        continue
      }
      // Campo de media: solo se prohíben los esquemas que nunca son legítimos.
      if (CLAVES_DE_MEDIA.has(clave)) {
        if (esquemaProhibido(v)) encontrados.push(rutaHija)
        continue
      }
      // Texto libre (bio, tagline, descripciones): no se toca. El render lo
      // escapa como texto, nunca como URL.
      continue
    }

    enlacesPeligrosos(v, rutaHija, encontrados)
  }
  return encontrados
}

/** Valida un bloque suelto tal como se va a persistir. */
export function validarBloqueParaPersistir(bloque: unknown): ResultadoValidacion {
  const errores: string[] = []

  if (!esObjetoPlano(bloque)) {
    return { ok: false, errores: ["El bloque no es un objeto."] }
  }

  const { block_type, position_index, content } = bloque as BloqueParaPersistir

  if (typeof block_type !== "string" || !TIPOS_DE_BLOQUE_VALIDOS.has(block_type)) {
    errores.push(`Tipo de bloque desconocido: ${JSON.stringify(block_type)}.`)
  }

  if (typeof position_index !== "number" || !Number.isInteger(position_index) || position_index < 0) {
    errores.push(`La posición debe ser un entero no negativo (llegó ${JSON.stringify(position_index)}).`)
  }

  if (!esObjetoPlano(content)) {
    errores.push("El contenido del bloque debe ser un objeto.")
  } else {
    if (profundidad(content) > MAX_PROFUNDIDAD) {
      errores.push(`El contenido está anidado más de ${MAX_PROFUNDIDAD} niveles.`)
    }

    let bytes = 0
    try {
      bytes = JSON.stringify(content)?.length ?? 0
    } catch {
      errores.push("El contenido no se puede serializar (¿referencias circulares?).")
    }
    if (bytes > MAX_BYTES_POR_BLOQUE) {
      errores.push(`El contenido supera el máximo de ${Math.round(MAX_BYTES_POR_BLOQUE / 1024)} kB.`)
    }

    const peligrosos = enlacesPeligrosos(content)
    if (peligrosos.length > 0) {
      errores.push(`Enlace no permitido en: ${peligrosos.slice(0, 5).join(", ")}.`)
    }
  }

  return errores.length === 0 ? { ok: true } : { ok: false, errores }
}

export type ResultadoValidacionLote =
  | { ok: true }
  | { ok: false; errores: string[]; indicesInvalidos: number[] }

/**
 * Valida el lote completo que va a `publish_profile`. Se rechaza el lote
 * entero si alguno falla — igual que hace la migración 0010 dentro de la
 * transacción, para que el editor y la base den la misma respuesta.
 */
export function validarLoteDePublicacion(bloques: unknown): ResultadoValidacionLote {
  if (!Array.isArray(bloques)) {
    return { ok: false, errores: ["La publicación debe ser una lista de bloques."], indicesInvalidos: [] }
  }
  if (bloques.length > MAX_BLOQUES_POR_LOTE) {
    return {
      ok: false,
      errores: [`Demasiados bloques (${bloques.length}); el máximo es ${MAX_BLOQUES_POR_LOTE}.`],
      indicesInvalidos: [],
    }
  }

  const errores: string[] = []
  const indicesInvalidos: number[] = []

  bloques.forEach((bloque, i) => {
    const r = validarBloqueParaPersistir(bloque)
    if (!r.ok) {
      indicesInvalidos.push(i)
      for (const e of r.errores) errores.push(`Bloque ${i + 1}: ${e}`)
    }
  })

  let bytesLote = 0
  try {
    bytesLote = JSON.stringify(bloques)?.length ?? 0
  } catch {
    errores.push("La publicación no se puede serializar.")
  }
  if (bytesLote > MAX_BYTES_POR_LOTE) {
    errores.push(`La publicación supera el máximo de ${Math.round(MAX_BYTES_POR_LOTE / 1024)} kB.`)
  }

  return errores.length === 0 ? { ok: true } : { ok: false, errores, indicesInvalidos }
}

// ─── Modo observación ───────────────────────────────────────────────────────
//
// Mitigación exigida por el plan (§F3, riesgo más alto): antes de rechazar
// nada en producción, el validador corre en modo *observación*: registra lo
// que HABRÍA rechazado y deja pasar la publicación. Se revisan los registros
// contra los perfiles reales, y recién entonces se activa el rechazo y se
// aplica la migración 0010.
//
// Se controla con `NEXT_PUBLIC_VALIDACION_BLOQUES`:
//   • ausente | "observar"  → observa y deja pasar   (valor por defecto, seguro)
//   • "rechazar"            → rechaza
//
// Es `NEXT_PUBLIC_` a propósito: la primera capa corre en el navegador, dentro
// del editor. La segunda capa (la migración) no depende de esta variable.

export type ModoValidacion = "observar" | "rechazar"

export function modoValidacion(): ModoValidacion {
  return process.env.NEXT_PUBLIC_VALIDACION_BLOQUES === "rechazar" ? "rechazar" : "observar"
}

/**
 * Aplica el modo vigente. Devuelve `null` si la publicación puede continuar, o
 * el mensaje a mostrar en el toast que el editor YA usa si debe frenarse.
 */
export function evaluarLoteSegunModo(
  bloques: unknown,
  registrar: (mensaje: string, detalle: string[]) => void = registroPorDefecto
): string | null {
  const r = validarLoteDePublicacion(bloques)
  if (r.ok) return null

  if (modoValidacion() === "observar") {
    registrar("[validacion-bloques][observacion] se habría rechazado la publicación", r.errores)
    return null
  }

  // Un solo mensaje legible; el detalle completo va al registro.
  registrar("[validacion-bloques] publicación rechazada", r.errores)
  return r.errores.length === 1
    ? r.errores[0]
    : `No se pudo publicar: ${r.errores[0]} (y ${r.errores.length - 1} problema(s) más)`
}

function registroPorDefecto(mensaje: string, detalle: string[]) {
  // Solo la forma del problema, nunca el contenido del bloque.
  console.warn(mensaje, detalle)
}

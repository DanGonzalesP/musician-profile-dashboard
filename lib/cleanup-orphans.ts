// Decisión de qué archivo de R2 es huérfano y cuál no.
//
// Se extrajo de app/api/cleanup-orphaned-files/route.ts para poder probarla sin
// red, sin bucket y sin base: es la lógica que BORRA ARCHIVOS EN MASA y ya
// causó una pérdida de datos real (el bug de las 1000 filas de PostgREST).
//
// Tres capas de protección, en orden (P-05):
//
//   1. **Contenido en uso.** Si la URL pública aparece en el "haystack" —los
//      bloques publicados, los productos, los servicios y los borradores que el
//      administrador puede leer— el archivo se queda. Es la regla original.
//
//   2. **Ventana de gracia.** Un archivo con fila de propiedad reciente en
//      `media_assets` NUNCA es huérfano, aunque no aparezca en ningún
//      contenido. Cubre el hueco temporal entre "el usuario subió la imagen" y
//      "el usuario publicó el bloque que la usa": ahí el archivo existe, es
//      legítimo, y el haystack todavía no lo menciona.
//
//   3. **Atribución obligatoria.** Un archivo SIN fila en `media_assets` no se
//      puede razonar: no sabemos de quién es ni cuándo se subió. Por defecto se
//      deja en paz y se reporta aparte. Solo se borra si quien ejecuta la
//      limpieza lo pide explícitamente (`incluirSinAtribuir`), que es el modo
//      que sirve para los históricos anteriores a la migración 0002.
//
// El sesgo es deliberado y coincide con el de `media_assets`: preferir un
// huérfano que ocupa espacio barato a un borrado irreversible de algo en uso.

/** 7 días. Suficiente para cubrir un borrador que se cocina un fin de semana. */
export const VENTANA_DE_GRACIA_MS = 7 * 24 * 60 * 60 * 1000

export type EntradaClasificacion = {
  /** Keys tal como las lista R2, p. ej. `audio/1738...-a1b2.mp3`. */
  claves: string[]
  /** `R2_PUBLIC_URL`, sin barra final. */
  urlPublicaBase: string
  /** Todo el contenido en uso, ya serializado a texto. */
  haystack: string
  /** key → `created_at` de su fila en `media_assets`, para las filas visibles. */
  activos: Map<string, string>
  /** `Date.now()` inyectado, para que las pruebas no dependan del reloj. */
  ahora: number
  ventanaGraciaMs?: number
  /** Borrar también lo que no tiene fila de propiedad. Por defecto, no. */
  incluirSinAtribuir?: boolean
}

export type Clasificacion = {
  /** Referenciados desde algún contenido. */
  enUso: string[]
  /** Subidos hace menos de la ventana de gracia. */
  protegidasPorGracia: string[]
  /** Sin fila en `media_assets`: no se pueden razonar. */
  sinAtribuir: string[]
  /** Lo único que se borra. */
  huerfanas: string[]
}

export function clasificarClaves(entrada: EntradaClasificacion): Clasificacion {
  const {
    claves,
    urlPublicaBase,
    haystack,
    activos,
    ahora,
    ventanaGraciaMs = VENTANA_DE_GRACIA_MS,
    incluirSinAtribuir = false,
  } = entrada

  const base = urlPublicaBase.replace(/\/+$/, "")
  const resultado: Clasificacion = { enUso: [], protegidasPorGracia: [], sinAtribuir: [], huerfanas: [] }

  for (const key of claves) {
    if (haystack.includes(`${base}/${key}`)) {
      resultado.enUso.push(key)
      continue
    }

    const creadoEn = activos.get(key)
    if (creadoEn === undefined) {
      // Sin dueño registrado. Es el caso de los archivos anteriores a 0002.
      if (incluirSinAtribuir) resultado.huerfanas.push(key)
      else resultado.sinAtribuir.push(key)
      continue
    }

    const marca = Date.parse(creadoEn)
    // Una fecha ilegible se trata como "recién subido": ante la duda, no se borra.
    if (!Number.isFinite(marca) || ahora - marca < ventanaGraciaMs) {
      resultado.protegidasPorGracia.push(key)
      continue
    }

    resultado.huerfanas.push(key)
  }

  return resultado
}

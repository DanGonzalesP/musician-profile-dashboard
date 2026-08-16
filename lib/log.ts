// Log estructurado del servidor.
//
// Por qué existe (P-22): hoy todo termina en `console.error("[ruta]", error)`,
// que en Vercel es una línea de texto suelta imposible de filtrar, agregar o
// alertar. Cuando un usuario dice "se borraron mis fotos", no hay forma de
// reconstruir qué pasó.
//
// Qué hace: emite una línea JSON por evento, con campos estables
// (`nivel`, `ruta`, `request_id`, `mensaje`, `duracion_ms`, `resultado`), que
// cualquier drain de Vercel o agregador puede parsear sin expresiones
// regulares.
//
// LO QUE NUNCA REGISTRA — y esto es la parte que importa:
//   • Correos, DNI, nombres legales, teléfonos, direcciones.
//   • Tokens, claves, cookies, cabeceras Authorization.
//   • Contenido de bloques, borradores, bios, textos de comentarios.
//
// Registrar de más no es una mejora de observabilidad: es una fuga de
// privacidad con formato bonito. Por eso la redacción no es un consejo en un
// comentario sino una función con pruebas (`log.test.ts`), y la lista de
// claves prohibidas se aplica a CUALQUIER profundidad del objeto.
//
// El `user_id` sí se registra: es un UUID opaco, no un dato personal por sí
// solo, y sin él es imposible atender un reporte de un usuario concreto.

export type NivelLog = "info" | "warn" | "error"

/** Claves cuyo valor jamás sale en un log, sin importar dónde aparezcan. */
const CLAVES_PROHIBIDAS = [
  "email",
  "correo",
  "dni",
  "documento",
  "nombre_legal",
  "legal_name",
  "legal_settings",
  "telefono",
  "phone",
  "direccion",
  "address",
  "password",
  "contrasena",
  "token",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "secret",
  "clave",
  "key_id",
  "content",
  "draft_content",
  "bio",
  "texto",
  "body",
  "mensaje_usuario",
  "comentario",
  "prompt",
]

/** Profundidad máxima al recorrer: un objeto ciclado no debe colgar el proceso. */
const PROFUNDIDAD_MAX = 6
const LARGO_MAX_TEXTO = 500

function redactarTexto(texto: string): string {
  return texto
    .slice(0, LARGO_MAX_TEXTO)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo redactado]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redactado]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[jwt redactado]")
    .replace(/([?&](?:token|access_token|refresh_token|key|api_key|signature|x-amz-signature|x-amz-credential)=)[^&\s]+/gi, "$1[redactado]")
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, "[secreto redactado]")
    .replace(/\b\d{8}\b/g, "[documento redactado]")
}

function esProhibida(clave: string): boolean {
  const k = clave.toLowerCase()
  return CLAVES_PROHIBIDAS.some((p) => k === p || k.endsWith(`_${p}`) || k.includes(p))
}

/**
 * Devuelve una copia del valor apta para registrar: sin claves sensibles, sin
 * ciclos, sin cadenas gigantes. Exportada porque es lo que prueban los tests:
 * la redacción es un criterio de aceptación, no un detalle.
 */
export function redactar(valor: unknown, profundidad = 0, vistos = new WeakSet<object>()): unknown {
  if (valor === null || valor === undefined) return valor
  if (typeof valor === "number" || typeof valor === "boolean") return valor

  if (typeof valor === "string") {
    const limpio = redactarTexto(valor)
    return valor.length > LARGO_MAX_TEXTO ? `${limpio}…[recortado]` : limpio
  }

  if (typeof valor === "bigint") return valor.toString()
  if (typeof valor === "function" || typeof valor === "symbol") return "[no serializable]"

  if (profundidad >= PROFUNDIDAD_MAX) return "[profundidad máxima]"

  if (valor instanceof Date) return valor.toISOString()

  if (valor instanceof Error) {
    return {
      nombre: valor.name,
      // No se registra la pila: en desarrollo contiene la ruta personal del
      // equipo y su primera línea repite el mensaje. El mensaje pasa por el
      // saneo de secretos antes de salir.
      mensaje: redactar(valor.message, profundidad + 1, vistos),
    }
  }

  if (typeof valor === "object") {
    if (vistos.has(valor as object)) return "[ciclo]"
    vistos.add(valor as object)

    if (Array.isArray(valor)) {
      return valor.slice(0, 50).map((v) => redactar(v, profundidad + 1, vistos))
    }

    const salida: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = esProhibida(clave) ? "[redactado]" : redactar(v, profundidad + 1, vistos)
    }
    return salida
  }

  return "[no serializable]"
}

export type CamposLog = Record<string, unknown> & {
  /** UUID de Supabase. Opaco, no es PII por sí solo. */
  userId?: string
  /** Correlaciona todas las líneas de una misma petición. */
  requestId?: string
  duracionMs?: number
  resultado?: "ok" | "error" | "rechazado"
}

function emitir(nivel: NivelLog, ruta: string, mensaje: string, campos: CamposLog = {}) {
  const linea = {
    nivel,
    ruta,
    mensaje,
    ts: new Date().toISOString(),
    ...(redactar(campos) as Record<string, unknown>),
  }

  const texto = JSON.stringify(linea)
  if (nivel === "error") console.error(texto)
  else if (nivel === "warn") console.warn(texto)
  else console.log(texto)
}

export function logInfo(ruta: string, mensaje: string, campos?: CamposLog) {
  emitir("info", ruta, mensaje, campos)
}

export function logWarn(ruta: string, mensaje: string, campos?: CamposLog) {
  emitir("warn", ruta, mensaje, campos)
}

export function logError(ruta: string, mensaje: string, error: unknown, campos?: CamposLog) {
  emitir("error", ruta, mensaje, { ...campos, error: redactar(error), resultado: "error" })
}

/**
 * Identificador de correlación de la petición. Vercel ya manda `x-vercel-id`;
 * si no está, se genera uno. Nunca se deriva de datos del usuario.
 */
export function idDePeticion(request: Request): string {
  return (
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    globalThis.crypto?.randomUUID?.() ??
    `req-${Date.now().toString(36)}`
  )
}

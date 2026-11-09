import { CONTENT_TYPES_BY_EXTENSION } from "@/lib/upload-validation"

/** El rango se resuelve contra el inventario autorizado, nunca contra datos
 * enviados por el cliente. Una sola parte evita amplificación multipart. */
export function mediaRange(header: string | null, size: number): { start: number; end: number } | null | false {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return false
  const first = match[1] ? Number(match[1]) : null
  const last = match[2] ? Number(match[2]) : null
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false
  const start = first ?? Math.max(0, size - (last ?? 0))
  const end = first === null ? size - 1 : Math.min(last ?? size - 1, size - 1)
  return start >= size || start > end ? false : { start, end }
}

/** No SVG/HTML ejecutable bajo el origen de la aplicación. */
export function safeMediaType(value: unknown): value is string {
  return typeof value === "string" && Object.values(CONTENT_TYPES_BY_EXTENSION).some(types => types.includes(value))
}

export function validMediaKey(key: string): boolean {
  return key.length <= 1024 && /^(images|audio|video)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]{1,10}$/.test(key)
}

export function mediaHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Vary": "Cookie, Authorization",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  })
}

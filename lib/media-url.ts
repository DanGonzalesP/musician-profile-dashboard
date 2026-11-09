import { validMediaKey } from "@/lib/media-delivery"

export const MEDIA_PATH = "/api/media/"

/** Sólo orígenes configurados. Un enlace externo con la misma ruta no es R2. */
export function mediaKeyFromUrl(value: unknown, legacyBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL): string | null {
  if (typeof value !== "string") return null
  if (value.startsWith(MEDIA_PATH)) {
    const key = value.slice(MEDIA_PATH.length)
    return validMediaKey(key) ? key : null
  }
  try {
    const target = new URL(value)
    if (target.username || target.password || target.protocol !== "https:") return null
    if (!legacyBase) return null
    const base = new URL(legacyBase)
    const prefix = `${base.pathname.replace(/\/+$/, "")}/`
    if (target.origin !== base.origin || !target.pathname.startsWith(prefix)) return null
    const key = decodeURIComponent(target.pathname.slice(prefix.length))
    return validMediaKey(key) ? key : null
  } catch { return null }
}

export function mediaUrl(value: string): string {
  const key = mediaKeyFromUrl(value)
  return key ? `${MEDIA_PATH}${key}` : value
}

/** JSON de bloques/borradores: conserva propiedades, embeds y valores ajenos. */
export function rewriteMediaUrls<T>(value: T): T {
  if (typeof value === "string") return mediaUrl(value) as T
  if (Array.isArray(value)) return value.map(item => rewriteMediaUrls(item)) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteMediaUrls(item)])) as T
  }
  return value
}

/** Compara por la key estable, incluso tras transformar un enlace histórico. */
export function collectMediaUrls(value: unknown): Set<string> {
  const urls = new Set<string>()
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      const key = mediaKeyFromUrl(item)
      if (key) urls.add(`${MEDIA_PATH}${key}`)
    } else if (Array.isArray(item)) item.forEach(visit)
    else if (item && typeof item === "object") Object.values(item).forEach(visit)
  }
  visit(value)
  return urls
}

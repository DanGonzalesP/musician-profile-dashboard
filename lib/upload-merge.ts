/** Aplica sólo sustituciones blob→URL permanente a la versión más reciente.
 * No reemplaza títulos, orden, objetos nuevos ni cambios hechos durante R2. */
export function mergeUploadedUrls<T>(current: T, before: unknown, uploaded: unknown): T {
  const replacements = new Map<string, string>()
  function collect(a: unknown, b: unknown) {
    if (typeof a === "string" && a.startsWith("blob:") && typeof b === "string" && !b.startsWith("blob:")) replacements.set(a, b)
    else if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of Object.keys(a)) collect((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    }
  }
  function replace(value: unknown): unknown {
    if (typeof value === "string") return replacements.get(value) ?? value
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]))
    return value
  }
  collect(before, uploaded)
  return replace(current) as T
}

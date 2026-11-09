type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 408 | 413 }

/** Lee metadatos JSON con límite real de bytes y tiempo, sin fiarse de headers. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonObjectResult> {
  const reader = request.body?.getReader()
  if (!reader) return { ok: false, status: 400 }
  const chunks: Uint8Array[] = []
  let size = 0
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    void reader.cancel().catch(() => {})
  }, 10_000)
  try {
    while (true) {
      const chunk = await reader.read()
      if (expired) return { ok: false, status: 408 }
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => {})
        return { ok: false, status: 413 }
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, status: 400 }
    return { ok: true, value: value as Record<string, unknown> }
  } catch {
    return { ok: false, status: expired ? 408 : 400 }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

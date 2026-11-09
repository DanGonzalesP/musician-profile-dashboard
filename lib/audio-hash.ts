/**
 * Calcula el hash SHA-256 de un ArrayBuffer directamente en el navegador
 * (Web Crypto, sin librerías externas) — sirve como huella digital para
 * probar que este archivo exacto existía en un momento dado.
 */
export async function sha256Bytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function sha256File(file: File): Promise<string> {
  return sha256Bytes(await file.arrayBuffer())
}

/** Limita también respuestas sin Content-Length; nunca acumula un cuerpo ilimitado. */
export async function readAudioForHash(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!response.ok || !response.body) throw new Error("audio_unavailable")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("audio_too_large")
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error("audio_too_large")
      chunks.push(value)
    }
    complete = true
    if (!size) throw new Error("audio_empty")
    const result = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
    return result.buffer
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

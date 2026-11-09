import { sha256Bytes } from "@/lib/audio-hash"

const STORAGE_KEY = "vibe:pending-uploads:v1"
const MAX_AGE = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Entry = { fingerprint: string; uploadId: string; createdAt: number }

function readEntries(): Entry[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw || raw.length > 32_000) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const now = Date.now()
  return parsed.filter((entry): entry is Entry => Boolean(entry) &&
    typeof entry.fingerprint === "string" && /^[0-9a-f]{64}$/.test(entry.fingerprint) &&
    typeof entry.uploadId === "string" && UUID.test(entry.uploadId) &&
    Number.isSafeInteger(entry.createdAt) && entry.createdAt <= now && entry.createdAt > now - MAX_AGE).slice(-100)
}

/** Sólo identidad opaca de intento: nunca bytes, nombre, token ni URL firmada.
 * Requiere volver a seleccionar los mismos bytes y el mismo destino/cuenta.
 * La composición de hashes por bloques evita cargar vídeos enteros en memoria;
 * esta huella local no es un certificado ni sustituye HEAD/RLS/finalización. */
export async function recoverUploadAttempt(file: File, context: string[], fallbackId: string, signal?: AbortSignal) {
  const fallback = { uploadId: fallbackId, recovered: false, forget: () => {} }
  try {
    if (typeof window === "undefined") return fallback
    // Comprobar acceso antes del trabajo de hashing; almacenamiento bloqueado
    // no impide usar el protocolo habitual en memoria.
    window.localStorage.getItem(STORAGE_KEY)
    const chunks: string[] = []
    const chunkSize = 1024 * 1024
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      signal?.throwIfAborted()
      chunks.push(await sha256Bytes(await file.slice(offset, offset + chunkSize).arrayBuffer()))
    }
    signal?.throwIfAborted()
    const encoded = new TextEncoder().encode(JSON.stringify([
      "vibe-upload-chunks-v1", ...context, file.size, file.type, chunks,
    ]))
    // Copia exacta en un ArrayBuffer propio: hashea sólo estos bytes.
    const fingerprintBytes = new Uint8Array(encoded.byteLength)
    fingerprintBytes.set(encoded)
    const fingerprint = await sha256Bytes(fingerprintBytes.buffer)
    signal?.throwIfAborted()
    // Leer DESPUÉS del hash para no pisar otras subidas terminadas mientras se calculaba.
    const entries = readEntries()
    const previous = entries.find(entry => entry.fingerprint === fingerprint)
    const uploadId = previous?.uploadId ?? fallbackId
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(previous ? entries : [
      ...entries.slice(-99), { fingerprint, uploadId, createdAt: Date.now() },
    ]))
    return { uploadId, recovered: Boolean(previous), forget: () => {
      try {
        const remaining = readEntries().filter(entry => entry.fingerprint !== fingerprint || entry.uploadId !== uploadId)
        if (remaining.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
        else window.localStorage.removeItem(STORAGE_KEY)
      } catch { /* La disponibilidad del almacenamiento local no prueba estado remoto. */ }
    } }
  } catch {
    signal?.throwIfAborted()
    return fallback
  }
}

/** El diario del navegador es una pista, no una prueba de identidad del objeto.
 * Antes de reutilizarlo, comparar todos los bytes con el archivo reseleccionado.
 * Memoria acotada; no guardar una segunda copia del archivo en almacenamiento. */
export async function recoveredBytesMatch(response: Response, file: File, signal: AbortSignal): Promise<boolean> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new Error("recovery_read_unavailable")
  }
  const reader = response.body.getReader()
  let offset = 0
  let complete = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) { complete = true; return offset === file.size }
      if (offset + value.byteLength > file.size) return false
      for (let start = 0; start < value.byteLength; start += 1024 * 1024) {
        signal.throwIfAborted()
        const part = value.subarray(start, Math.min(start + 1024 * 1024, value.byteLength))
        const expected = new Uint8Array(await file.slice(offset, offset + part.byteLength).arrayBuffer())
        if (part.some((byte, index) => byte !== expected[index])) return false
        offset += part.byteLength
      }
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

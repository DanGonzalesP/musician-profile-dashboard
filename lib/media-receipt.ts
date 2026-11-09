import { createHmac } from "node:crypto"

/** Prueba interna del servidor, siempre acompañada del JWT real del propietario.
 * No concede permisos generales sobre Postgres ni reemplaza RLS/auth.uid().
 * La clave se provisiona también en private.media_runtime_keys, fuera de Git. */
export type MediaReceipt = {
  action: "reserve" | "finalize" | "retire"
  actor: string
  key: string
  bytes: number
  contentType?: string
  profileId?: string | null
  limitBytes?: number
  quotaMode?: "observar" | "rechazar"
  etag?: string
}

export function mediaReceiptsConfigured(): boolean {
  return /^[a-f0-9]{64}$/i.test(process.env.MEDIA_RECEIPT_KEY ?? "") &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(process.env.MEDIA_RECEIPT_KEY_ID ?? "runtime")
}

export function signMediaReceipt(receipt: MediaReceipt, secret = process.env.MEDIA_RECEIPT_KEY,
  keyId = process.env.MEDIA_RECEIPT_KEY_ID ?? "runtime") {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("La coordinación de archivos no está configurada.")
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(keyId)) throw new Error("Identificador de clave inválido.")
  const p_payload = JSON.stringify({ ...receipt, version: 1, keyId, issuedAt: Math.floor(Date.now() / 1000) })
  const p_signature = createHmac("sha256", Buffer.from(secret, "hex")).update(p_payload).digest("hex")
  return { p_payload, p_signature }
}

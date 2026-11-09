import type { SupabaseClient } from "@supabase/supabase-js"
import { signMediaReceipt } from "@/lib/media-receipt"

/** La reclamación bloquea nuevas referencias antes de escribir el marcador R2.
 * Si R2 o Postgres falla, el tombstone persiste y permite reintentar sin que
 * otro editor vuelva a publicar el archivo entre ambos sistemas. */
export async function deleteOwnedMedia(
  supabase: SupabaseClient,
  key: string,
  remove: (key: string) => Promise<{ bytes: 0; etag: string }>,
  actor: string,
): Promise<boolean> {
  // Históricos con espacios, escapes u otros formatos requieren atribución y
  // normalización explícitas; el extractor SQL sólo garantiza estas keys.
  if (!/^(images|audio|video)\/[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~-]+)*$/.test(key)
    || /(^|\/)\.{1,2}(\/|$)/.test(key)) return false
  const claim = await supabase.rpc("claim_media_deletion", { p_key: key })
  if (claim.error) throw new Error("No se pudo reservar el borrado del archivo.")
  if (claim.data !== true) return false
  // Validar configuración antes de alterar R2. El recibo final se emite
  // después del PUT, para que su ventana temporal no expire durante la red.
  signMediaReceipt({ action: "retire", actor, key, bytes: 0 })
  const marker = await remove(key)
  const result = await supabase.rpc("retire_media_upload", signMediaReceipt({ action: "retire", actor, key, ...marker }))
  if (result.error || result.data !== true) throw new Error("No se pudo confirmar el borrado del archivo.")
  return true
}

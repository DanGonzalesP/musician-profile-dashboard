import { supabase } from "@/lib/supabase"

export type AuthorCertificate = {
  id: number
  songTitle: string
  fileHash: string
  createdAt: string
}

/**
 * Registra el momento oficial en que una pista (identificada por su hash)
 * quedó timestampeada. Es idempotente: si ya existe un certificado para ese
 * mismo (profileId, fileHash) — ej. al volver a publicar sin cambiar el
 * audio — el conflicto de unicidad se ignora en vez de fallar.
 */
export async function recordAuthorCertificate(
  profileId: string,
  input: { songTitle: string; fileHash: string }
): Promise<void> {
  const { error } = await supabase.from("author_certificates").insert({
    profile_id: profileId,
    song_title: input.songTitle,
    file_hash: input.fileHash,
  })
  // 23505 = unique_violation: ya estaba registrado, no es un error real.
  if (error && error.code !== "23505") throw error
}

export async function fetchCertificateByHash(
  profileId: string,
  fileHash: string
): Promise<AuthorCertificate | null> {
  const { data, error } = await supabase
    .from("author_certificates")
    .select("id, song_title, file_hash, created_at")
    .eq("profile_id", profileId)
    .eq("file_hash", fileHash)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    songTitle: data.song_title,
    fileHash: data.file_hash,
    createdAt: data.created_at,
  }
}

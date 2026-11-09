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
  input: { songTitle: string; fileHash: string },
  expectedOwner?: string
): Promise<void> {
  const session = expectedOwner ? await supabase.auth.getSession() : null
  if (expectedOwner && (session?.error || session?.data.session?.user.id !== expectedOwner)) {
    throw new Error("La cuenta cambió antes de registrar la pista.")
  }
  const request = supabase.from("author_certificates").insert({
    profile_id: profileId,
    song_title: input.songTitle,
    file_hash: input.fileHash,
  })
  if (session?.data.session) request.setHeader("Authorization", `Bearer ${session.data.session.access_token}`)
  const { error } = await request
  // 23505 = unique_violation: ya estaba registrado, no es un error real.
  if (error && error.code !== "23505") throw error
}

export async function fetchCertificateByHash(
  profileId: string,
  fileHash: string,
  expectedOwner?: string
): Promise<AuthorCertificate | null> {
  const { data: auth, error: authError } = await supabase.auth.getSession()
  if (authError || !auth.session || (expectedOwner && auth.session.user.id !== expectedOwner)) {
    throw new Error("No se pudo verificar la cuenta del certificado.")
  }
  const { data, error } = await supabase
    .from("author_certificates")
    .select("id, song_title, file_hash, created_at")
    .eq("profile_id", profileId)
    .eq("file_hash", fileHash)
    .maybeSingle()
    .setHeader("Authorization", `Bearer ${auth.session.access_token}`)

  if (error) throw new Error("No se pudo cargar el certificado.")
  if (!data) return null

  return {
    id: data.id,
    songTitle: data.song_title,
    fileHash: data.file_hash,
    createdAt: data.created_at,
  }
}

import { supabase } from "@/lib/supabase"

// La base filtra antes de limitar; el navegador recibe sólo coincidencias.
export type PlatformSongResult = {
  songKey: string
  title: string
  albumTitle: string
  ownerProfileId: string
  ownerDisplayName: string
}

type SongRow = {
  song_key: string
  title: string
  album_title: string
  owner_profile_id: string
  owner_display_name: string
}

function isSongRow(value: unknown): value is SongRow {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return typeof row.song_key === "string" && row.song_key.length > 0 &&
    typeof row.title === "string" && row.title.trim().length > 0 &&
    typeof row.album_title === "string" && typeof row.owner_display_name === "string" &&
    typeof row.owner_profile_id === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.owner_profile_id)
}

export async function searchPlatformSongs(query: string, excludeProfileId?: string, signal?: AbortSignal): Promise<PlatformSongResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  if (q.length > 200) throw new Error("Usa hasta 200 caracteres para buscar canciones.")

  const request = supabase.rpc("buscar_canciones_publicadas", {
    p_consulta: q,
    p_excluir_perfil: excludeProfileId ?? null,
  })

  const timeout = AbortSignal.timeout(15_000)
  request.abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout)
  const { data, error } = await request
  if (error || !Array.isArray(data) || data.length > 20 || !data.every(isSongRow)) {
    throw new Error("No se pudo buscar canciones.")
  }
  return (data as SongRow[]).map(row => ({
    songKey: row.song_key,
    title: row.title,
    albumTitle: row.album_title,
    ownerProfileId: row.owner_profile_id,
    ownerDisplayName: row.owner_display_name,
  }))
}

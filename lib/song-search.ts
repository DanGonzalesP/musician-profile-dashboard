import { supabase } from "@/lib/supabase"

// Búsqueda de canciones ya publicadas en la plataforma (bloque "tracks" de
// CUALQUIER artista) para la opción "Colaboración con artista de la
// plataforma" del Bloque 4. No hay una tabla normalizada de canciones —
// viven dentro del content JSONB de profile_blocks — así que se trae el
// contenido visible de esos bloques y se filtra en el cliente. Para el
// tamaño actual de la plataforma es suficiente; si el catálogo crece mucho
// convendría mover esto a una función de Postgres con búsqueda indexada.
export type PlatformSongResult = {
  songKey: string
  title: string
  albumTitle: string
  ownerProfileId: string
  ownerDisplayName: string
}

type AlbumRow = { id?: string; title?: string; tracks?: { title?: string }[] }
type BlockRow = {
  id: string
  profile_id: string
  content: { albums?: AlbumRow[] } | null
  profiles: { display_name: string | null } | null
}

export async function searchPlatformSongs(query: string, excludeProfileId?: string): Promise<PlatformSongResult[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const { data, error } = await supabase
    .from("profile_blocks")
    .select("id, profile_id, content, profiles!inner(display_name)")
    .in("block_type", ["tracks"])
    .eq("is_visible", true)

  if (error) throw error

  const rows = (data ?? []) as unknown as BlockRow[]
  const results: PlatformSongResult[] = []

  for (const row of rows) {
    if (excludeProfileId && row.profile_id === excludeProfileId) continue
    const albums = Array.isArray(row.content?.albums) ? row.content!.albums! : []
    for (const album of albums) {
      const tracks = Array.isArray(album.tracks) ? album.tracks : []
      tracks.forEach((track, i) => {
        const title = String(track?.title ?? "").trim()
        if (!title || !title.toLowerCase().includes(q)) return
        results.push({
          songKey: `${row.id}:${album.id ?? "album"}:${i}`,
          title,
          albumTitle: String(album.title ?? ""),
          ownerProfileId: row.profile_id,
          ownerDisplayName: row.profiles?.display_name || "Artista desconocido",
        })
      })
    }
  }

  return results.slice(0, 20)
}

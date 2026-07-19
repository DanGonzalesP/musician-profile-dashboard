import { supabase } from "@/lib/supabase"
import type { FeedTrack } from "@/lib/musicFeed"
import { parseMusicianRoles, type MusicianRole } from "@/lib/musician-roles"

// Publicaciones de los usuarios en el feed principal. No hay una tabla
// propia: son los ítems del bloque "publicaciones" que cada perfil ya
// publicó en su página (profile_blocks.block_type = 'publicaciones',
// is_visible = true), aplanados a un formato de feed. Mientras nadie haya
// publicado nada, esto devuelve [] y el feed muestra solo música.

export type FeedPost = {
  id: string
  profileId: string
  authorName: string
  mediaType: "image" | "video"
  url: string
  thumbnail?: string
  caption?: string
  roles: MusicianRole[]
  isGroup: boolean
  createdAt: string
}

// El feed principal mezcla dos tipos de contenido en un solo scroll.
export type FeedItem =
  | { kind: "track"; id: string; track: FeedTrack }
  | { kind: "post"; id: string; post: FeedPost }

type PublicacionesRow = {
  id: string
  profile_id: string
  content: unknown
  created_at?: string | null
  profiles: {
    display_name: string | null
    musician_roles?: unknown
    musician_category?: string | null
    profile_type?: string | null
  } | null
}

export async function fetchPublicPosts(limit: number = 60): Promise<FeedPost[]> {
  // Igual que fetchAllPublicFeed: se degrada si faltan columnas nuevas.
  const selects = [
    `id, profile_id, content, created_at, profiles ( display_name, musician_roles, profile_type )`,
    `id, profile_id, content, created_at, profiles ( display_name, musician_category, profile_type )`,
    `id, profile_id, content, profiles ( display_name )`,
  ]

  let rows: PublicacionesRow[] | null = null
  for (const select of selects) {
    const { data, error } = await supabase
      .from("profile_blocks")
      .select(select)
      .eq("block_type", "publicaciones")
      .eq("is_visible", true)
      .limit(limit)
    if (!error) {
      rows = data as unknown as PublicacionesRow[]
      break
    }
  }
  if (!rows) return []

  const posts: FeedPost[] = []
  for (const row of rows) {
    const content = row.content as { items?: unknown } | null
    const items = Array.isArray(content?.items) ? content.items : []
    const roles = parseMusicianRoles(row.profiles?.musician_roles ?? row.profiles?.musician_category)
    for (const raw of items) {
      const item = raw as { id?: string; type?: string; url?: string; thumbnail?: string; caption?: string }
      if (!item?.url || (item.type !== "image" && item.type !== "video")) continue
      posts.push({
        id: `${row.id}:${item.id ?? posts.length}`,
        profileId: row.profile_id,
        authorName: row.profiles?.display_name || "Artista Desconocido",
        mediaType: item.type,
        url: item.url,
        thumbnail: item.thumbnail || undefined,
        caption: item.caption || undefined,
        roles,
        isGroup: row.profiles?.profile_type === "band",
        createdAt: row.created_at ?? new Date().toISOString(),
      })
    }
  }
  return posts
}

/**
 * Mezcla pistas y publicaciones en un solo feed con orden aleatorio
 * (Fisher–Yates). Se baraja en el servidor en cada visita (la home es
 * force-dynamic), así el feed se siente vivo sin necesitar un algoritmo
 * de recomendación todavía.
 */
export function buildMixedFeed(tracks: FeedTrack[], posts: FeedPost[]): FeedItem[] {
  const items: FeedItem[] = [
    ...tracks.map((track): FeedItem => ({ kind: "track", id: `track-${track.id}`, track })),
    ...posts.map((post): FeedItem => ({ kind: "post", id: `post-${post.id}`, post })),
  ]
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

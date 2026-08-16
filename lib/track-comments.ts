import { supabase } from "@/lib/supabase"
import { traducirErrorDeEscritura } from "@/lib/rate-limit-errors"

// Comentarios de las canciones del feed principal — tabla feed_comments
// (origen: supabase/legacy/setup_vibra.sql). Lectura pública; escribir requiere
// sesión. Si la tabla todavía no existe en Supabase, todo degrada a listas
// vacías para no romper el feed.

export type TrackComment = {
  id: string
  trackId: string
  userId: string
  authorName: string
  content: string
  createdAt: string
}

type CommentRow = {
  id: string
  track_id: string
  user_id: string
  author_name: string | null
  content: string
  created_at: string
}

function mapRow(row: CommentRow): TrackComment {
  return {
    id: row.id,
    trackId: row.track_id,
    userId: row.user_id,
    authorName: row.author_name || "Alguien de la comunidad",
    content: row.content,
    createdAt: row.created_at,
  }
}

export async function fetchTrackComments(trackId: string): Promise<TrackComment[]> {
  const { data, error } = await supabase
    .from("feed_comments")
    .select("id, track_id, user_id, author_name, content, created_at")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return []
  return (data as CommentRow[]).map(mapRow)
}

/** Conteo de comentarios por pista, para los contadores del rail de acciones. */
export async function fetchCommentCounts(trackIds: string[]): Promise<Record<string, number>> {
  if (trackIds.length === 0) return {}
  const { data, error } = await supabase
    .from("feed_comments")
    .select("track_id")
    .in("track_id", trackIds)

  if (error) return {}
  const counts: Record<string, number> = {}
  for (const row of data as { track_id: string }[]) {
    counts[row.track_id] = (counts[row.track_id] ?? 0) + 1
  }
  return counts
}

export async function addTrackComment(trackId: string, content: string): Promise<TrackComment> {
  const clean = content.trim()
  if (!clean) throw new Error("Escribe un comentario primero.")

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inicia sesión para comentar.")

  // author_name lo escribe un TRIGGER en la base a partir del perfil real de
  // quien comenta (ver 0004_lock_remaining_rls.sql). Antes lo mandaba el
  // cliente, así que cualquiera podía firmar un comentario con el nombre de
  // otro artista: RLS solo validaba user_id, nunca el nombre mostrado.
  const { data, error } = await supabase
    .from("feed_comments")
    .insert({ track_id: trackId, user_id: user.id, content: clean })
    .select("id, track_id, user_id, author_name, content, created_at")
    .single()

  if (error) {
    // El trigger de limite (migracion 0011) se traduce a un mensaje amable;
    // el resto de errores conserva el manejo de siempre.
    throw new Error(
      traducirErrorDeEscritura(
        error,
        "comentario",
        error.message.includes("feed_comments")
          ? "Los comentarios aún no están activados. Verifica las migraciones versionadas de Supabase."
          : error.message
      )
    )
  }
  return mapRow(data as CommentRow)
}

export async function deleteTrackComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("feed_comments").delete().eq("id", commentId)
  if (error) throw error
}

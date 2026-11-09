import { supabase } from "@/lib/supabase"
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset"
import { COMMENT_PAGE_SIZE } from "@/lib/comment-pagination"
import { deleteOwnFeedComment, saveFeedComment } from "@/lib/save-feed-comment"

// Comentarios de las canciones del feed principal — tabla feed_comments
// (origen: supabase/legacy/setup_vibra.sql). Lectura pública; escribir requiere
// sesión. Los fallos de lectura se muestran como errores recuperables.

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

export async function fetchTrackComments(trackId: string, cursor?: CursorFeed, signal?: AbortSignal): Promise<TrackComment[]> {
  let query = supabase
    .from("feed_comments")
    .select("id, track_id, user_id, author_name, content, created_at")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(COMMENT_PAGE_SIZE)
  if (cursor) query = query.or(expresionKeyset(cursor))
  const deadline = AbortSignal.timeout(15000)
  const { data, error } = await query.abortSignal(signal ? AbortSignal.any([signal, deadline]) : deadline)

  if (error) throw new Error("No se pudieron cargar los comentarios.")
  return ((data ?? []) as CommentRow[]).map(mapRow)
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

export async function addTrackComment(trackId: string, content: string, requestId?: string, expectedUserId?: string): Promise<TrackComment> {
  const saved = await saveFeedComment("track", trackId, content, requestId, expectedUserId)
  return { ...saved, trackId }
}

export async function deleteTrackComment(commentId: string, trackId: string, expectedUserId?: string): Promise<void> {
  await deleteOwnFeedComment("track", commentId, trackId, expectedUserId)
}

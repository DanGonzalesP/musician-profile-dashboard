import { supabase } from "@/lib/supabase"
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset"
import { COMMENT_PAGE_SIZE } from "@/lib/comment-pagination"
import { deleteOwnFeedComment, saveFeedComment } from "@/lib/save-feed-comment"

// Comentarios de las publicaciones del feed (fotos/videos) — tabla
// feed_post_comments (origen: supabase/legacy/feed_post_comments_table.sql). Hermana de
// lib/track-comments.ts; separada porque el id de una publicación es
// compuesto y no referencia ninguna tabla real (ver lib/feed/publicPosts.ts).

export type PostComment = {
  id: string
  postId: string
  userId: string
  authorName: string
  content: string
  createdAt: string
}

type CommentRow = {
  id: string
  post_id: string
  user_id: string
  author_name: string | null
  content: string
  created_at: string
}

function mapRow(row: CommentRow): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.author_name || "Alguien de la comunidad",
    content: row.content,
    createdAt: row.created_at,
  }
}

export async function fetchPostComments(postId: string, cursor?: CursorFeed, signal?: AbortSignal): Promise<PostComment[]> {
  let query = supabase
    .from("feed_post_comments")
    .select("id, post_id, user_id, author_name, content, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(COMMENT_PAGE_SIZE)
  if (cursor) query = query.or(expresionKeyset(cursor))
  const deadline = AbortSignal.timeout(15000)
  const { data, error } = await query.abortSignal(signal ? AbortSignal.any([signal, deadline]) : deadline)

  if (error) throw new Error("No se pudieron cargar los comentarios.")
  return ((data ?? []) as CommentRow[]).map(mapRow)
}

/** Conteo de comentarios por publicación, para los contadores del rail de acciones. */
export async function fetchPostCommentCounts(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {}
  const { data, error } = await supabase
    .from("feed_post_comments")
    .select("post_id")
    .in("post_id", postIds)

  if (error) return {}
  const counts: Record<string, number> = {}
  for (const row of data as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1
  }
  return counts
}

export async function addPostComment(postId: string, content: string, requestId?: string, expectedUserId?: string): Promise<PostComment> {
  const saved = await saveFeedComment("post", postId, content, requestId, expectedUserId)
  return { ...saved, postId }
}

export async function deletePostComment(commentId: string, postId: string, expectedUserId?: string): Promise<void> {
  await deleteOwnFeedComment("post", commentId, postId, expectedUserId)
}

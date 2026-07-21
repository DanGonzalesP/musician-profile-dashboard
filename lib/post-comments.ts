import { supabase } from "@/lib/supabase"

// Comentarios de las publicaciones del feed (fotos/videos) — tabla
// feed_post_comments (ver supabase/feed_post_comments_table.sql). Hermana de
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

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from("feed_post_comments")
    .select("id, post_id, user_id, author_name, content, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return []
  return (data as CommentRow[]).map(mapRow)
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

export async function addPostComment(postId: string, content: string): Promise<PostComment> {
  const clean = content.trim()
  if (!clean) throw new Error("Escribe un comentario primero.")

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inicia sesión para comentar.")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .eq("profile_type", "artist")
    .maybeSingle()
  const authorName =
    profile?.display_name?.trim() || user.email?.split("@")[0] || "Alguien de la comunidad"

  const { data, error } = await supabase
    .from("feed_post_comments")
    .insert({ post_id: postId, user_id: user.id, author_name: authorName, content: clean })
    .select("id, post_id, user_id, author_name, content, created_at")
    .single()

  if (error) {
    throw new Error(
      error.message.includes("feed_post_comments")
        ? "Los comentarios aún no están activados: falta correr supabase/feed_post_comments_table.sql."
        : error.message
    )
  }
  return mapRow(data as CommentRow)
}

import { supabase } from "@/lib/supabase"
import { traducirErrorDeEscritura } from "@/lib/rate-limit-errors"

async function commentAccount(expectedUserId?: string) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("Inicia sesión para gestionar tus comentarios.")
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.id !== user.id ||
    (expectedUserId !== undefined && user.id !== expectedUserId)) {
    throw new Error("La cuenta cambió. Vuelve a abrir los comentarios antes de continuar.")
  }
  return { user, token: data.session.access_token }
}

export async function deleteOwnFeedComment(kind: "track" | "post", commentId: string, targetId: string, expectedUserId?: string): Promise<void> {
  const { user, token } = await commentAccount(expectedUserId)
  const table = kind === "track" ? "feed_comments" : "feed_post_comments"
  const column = kind === "track" ? "track_id" : "post_id"
  const { error } = await supabase.from(table).delete()
    .eq("id", commentId).eq("user_id", user.id).eq(column, targetId)
    .setHeader("Authorization", `Bearer ${token}`)
  if (error) throw new Error("No pudimos confirmar la eliminación. Actualiza los comentarios.")
  const remaining = await supabase.from(table).select("id")
    .eq("id", commentId).eq("user_id", user.id).eq(column, targetId).maybeSingle()
    .setHeader("Authorization", `Bearer ${token}`)
  if (remaining.error || remaining.data) throw new Error("No pudimos confirmar la eliminación. Actualiza los comentarios.")
}

export async function saveFeedComment(kind: "track" | "post", targetId: string, content: string, requestId = crypto.randomUUID(), expectedUserId?: string) {
  const clean = content.trim()
  if (!clean) throw new Error("Escribe un comentario primero.")
  if (clean.length > 500) throw new Error("El comentario puede tener hasta 500 caracteres.")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("No se pudo preparar el comentario.")
  const { user, token } = await commentAccount(expectedUserId)
  const table = kind === "track" ? "feed_comments" : "feed_post_comments"
  const targetColumn = kind === "track" ? "track_id" : "post_id"
  const columns = `id, ${targetColumn}, user_id, author_name, content, created_at`
  const matches = (row: unknown): row is Record<string, unknown> => {
    if (!row || typeof row !== "object") return false
    const value = row as Record<string, unknown>
    return value.id === requestId && value[targetColumn] === targetId && value.user_id === user.id &&
      value.content === clean && typeof value.created_at === "string" &&
      (value.author_name === null || typeof value.author_name === "string")
  }
  const result = await Promise.resolve(supabase.from(table).insert({
    id: requestId, [targetColumn]: targetId, user_id: user.id, content: clean,
  }).select(columns).single().setHeader("Authorization", `Bearer ${token}`))
    .catch(() => ({ data: null, error: { code: "NETWORK_ERROR" } }))
  let saved: unknown = result.error ? null : result.data
  if (!matches(saved)) {
    const previous = await Promise.resolve(supabase.from(table).select(columns)
      .eq("id", requestId).eq("user_id", user.id).maybeSingle()
      .setHeader("Authorization", `Bearer ${token}`))
      .catch(() => ({ data: null, error: { code: "NETWORK_ERROR" } }))
    saved = previous.error ? null : previous.data
    if (!matches(saved)) throw new Error(traducirErrorDeEscritura(result.error, "comentario",
      "No pudimos confirmar el envío. Conservamos tu texto para que puedas reintentarlo."))
  }
  return { id: requestId, userId: user.id, content: clean,
    authorName: (saved.author_name as string | null) || "Alguien de la comunidad",
    createdAt: saved.created_at as string }
}

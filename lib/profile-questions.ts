import { supabase } from "@/lib/supabase"

// Preguntas de visitantes sobre un elemento puntual del perfil público —
// tabla profile_questions (ver supabase/profile_questions_table.sql). El
// dueño las ve en su barra de notificaciones junto a las solicitudes de
// crédito (lib/credit-requests.ts).

export type QuestionStatus = "unread" | "read"

export type ProfileQuestion = {
  id: string
  profileId: string
  askerUserId: string
  askerDisplayName: string
  blockType: string
  blockLabel: string
  message: string
  status: QuestionStatus
  createdAt: string
}

type QuestionRow = {
  id: string
  profile_id: string
  asker_user_id: string
  asker_display_name: string | null
  block_type: string
  block_label: string
  message: string
  status: QuestionStatus
  created_at: string
}

function mapRow(row: QuestionRow): ProfileQuestion {
  return {
    id: row.id,
    profileId: row.profile_id,
    askerUserId: row.asker_user_id,
    askerDisplayName: row.asker_display_name || "Alguien de la comunidad",
    blockType: row.block_type,
    blockLabel: row.block_label,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function createProfileQuestion(params: {
  profileId: string
  blockType: string
  blockLabel: string
  message: string
}): Promise<ProfileQuestion> {
  const clean = params.message.trim()
  if (!clean) throw new Error("Escribe una pregunta primero.")

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inicia sesión para preguntarle al artista.")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .eq("profile_type", "artist")
    .maybeSingle()
  const askerDisplayName =
    profile?.display_name?.trim() || user.email?.split("@")[0] || "Alguien de la comunidad"

  const { data, error } = await supabase
    .from("profile_questions")
    .insert({
      profile_id: params.profileId,
      asker_user_id: user.id,
      asker_display_name: askerDisplayName,
      block_type: params.blockType,
      block_label: params.blockLabel,
      message: clean,
    })
    .select("id, profile_id, asker_user_id, asker_display_name, block_type, block_label, message, status, created_at")
    .single()

  if (error) {
    throw new Error(
      error.message.includes("profile_questions")
        ? "Las preguntas aún no están activadas: falta correr supabase/profile_questions_table.sql."
        : error.message
    )
  }
  return mapRow(data as QuestionRow)
}

export async function fetchIncomingQuestions(profileId: string): Promise<ProfileQuestion[]> {
  const { data, error } = await supabase
    .from("profile_questions")
    .select("id, profile_id, asker_user_id, asker_display_name, block_type, block_label, message, status, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })

  if (error) return []
  return (data as QuestionRow[]).map(mapRow)
}

export async function fetchUnreadQuestionCount(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from("profile_questions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "unread")

  if (error) return 0
  return count ?? 0
}

export async function markQuestionRead(questionId: string): Promise<void> {
  const { error } = await supabase.from("profile_questions").update({ status: "read" }).eq("id", questionId)
  if (error) throw error
}

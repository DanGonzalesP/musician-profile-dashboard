import { supabase } from "@/lib/supabase"
import { traducirErrorDeEscritura } from "@/lib/rate-limit-errors"
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset"

// Preguntas de visitantes sobre un elemento puntual del perfil público —
// tabla profile_questions (origen: supabase/legacy/profile_questions_table.sql). El
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
  requestId?: string
  expectedUserId: string
}): Promise<ProfileQuestion> {
  const clean = params.message.trim()
  if (!clean) throw new Error("Escribe una pregunta primero.")
  if (clean.length > 500) throw new Error("La pregunta puede tener hasta 500 caracteres.")

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error("No pudimos comprobar tu sesión. Vuelve a intentarlo.")
  if (!user) throw new Error("Inicia sesión para preguntarle al artista.")
  if (user.id !== params.expectedUserId) throw new Error("La cuenta cambió. Vuelve a abrir la pregunta.")
  const { data: auth, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !auth.session || auth.session.user.id !== user.id) throw new Error("No pudimos confirmar tu sesión.")
  const token = auth.session.access_token
  const requestId = params.requestId ?? crypto.randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("No se pudo preparar el envío. Vuelve a abrir la pregunta.")
  }
  const columns = "id, profile_id, asker_user_id, asker_display_name, block_type, block_label, message, status, created_at"
  const matchesRequest = (row: QuestionRow | null): row is QuestionRow => !!row &&
    row.id === requestId && row.asker_user_id === user.id && row.profile_id === params.profileId &&
    row.block_type === params.blockType && row.block_label === params.blockLabel && row.message === clean &&
    (row.status === "read" || row.status === "unread") && typeof row.created_at === "string"

  // asker_display_name lo escribe un TRIGGER en la base a partir del perfil
  // real de quien pregunta (ver 0004_lock_remaining_rls.sql). Antes lo mandaba
  // el cliente, así que se podía firmar una pregunta con el nombre de otro
  // artista: RLS solo validaba asker_user_id, nunca el nombre mostrado.
  const { data, error } = await Promise.resolve(supabase
    .from("profile_questions")
    .insert({
      id: requestId,
      profile_id: params.profileId,
      asker_user_id: user.id,
      block_type: params.blockType,
      block_label: params.blockLabel,
      message: clean,
    })
    .select(columns)
    .single().setHeader("Authorization", `Bearer ${token}`))
    .catch(() => ({ data: null, error: { code: "NETWORK_ERROR" } }))

  if (error || !matchesRequest(data as QuestionRow | null)) {
    // Si se perdió la respuesta, confirmar la MISMA fila bajo RLS antes de repetir.
    // Un conflicto de clave nunca se interpreta por sí solo como éxito.
    const previous = await Promise.resolve(supabase.from("profile_questions").select(columns)
      .eq("id", requestId).eq("asker_user_id", user.id).maybeSingle()
      .setHeader("Authorization", `Bearer ${token}`))
      .catch(() => ({ data: null, error: { code: "NETWORK_ERROR" } }))
    if (!previous.error && matchesRequest(previous.data as QuestionRow | null)) {
      return mapRow(previous.data as QuestionRow)
    }
    throw new Error(
      traducirErrorDeEscritura(
        error ?? { code: "UNCONFIRMED_WRITE" },
        "pregunta",
        "No pudimos confirmar el envío de la pregunta. Conserva tu mensaje e inténtalo más tarde."
      )
    )
  }
  return mapRow(data as QuestionRow)
}

export const INCOMING_QUESTIONS_PAGE_SIZE = 50

export async function fetchIncomingQuestions(profileId: string, cursor?: CursorFeed | null, accessToken?: string): Promise<ProfileQuestion[]> {
  let query = supabase
    .from("profile_questions")
    .select("id, profile_id, asker_user_id, asker_display_name, block_type, block_label, message, status, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(INCOMING_QUESTIONS_PAGE_SIZE)
  if (cursor) query = query.or(expresionKeyset(cursor))
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data, error } = await query

  if (error) throw new Error("No se pudieron cargar las preguntas.")
  return ((data ?? []) as QuestionRow[]).map(mapRow)
}

export const SENT_QUESTIONS_PAGE_SIZE = 20

export type SentProfileQuestion = ProfileQuestion & {
  recipient: { displayName: string; username: string | null } | null
}

export async function fetchSentQuestions(cursor: CursorFeed | null = null): Promise<SentProfileQuestion[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("Inicia sesión para consultar tus preguntas enviadas.")
  const { data: auth, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !auth.session || auth.session.user.id !== user.id) throw new Error("Sesión no disponible.")
  const token = auth.session.access_token
  const query = supabase.from("profile_questions")
    .select("id, profile_id, asker_user_id, asker_display_name, block_type, block_label, message, status, created_at")
    .eq("asker_user_id", user.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(SENT_QUESTIONS_PAGE_SIZE)
    .setHeader("Authorization", `Bearer ${token}`)
  if (cursor) query.or(expresionKeyset(cursor))
  const { data, error } = await query
  if (error) throw new Error("No se pudieron cargar tus preguntas enviadas.")
  const questions = ((data ?? []) as QuestionRow[]).map(mapRow)
  if (!questions.length) return []
  // Resolver sólo los destinatarios visibles por RLS; nunca inferir su nombre
  // a partir del texto ni mostrar un enlace antiguo de un perfil renombrado.
  const profiles = await supabase.from("profiles").select("id, display_name, username")
    .in("id", [...new Set(questions.map(question => question.profileId))])
    .setHeader("Authorization", `Bearer ${token}`)
  if (profiles.error) throw new Error("No se pudieron cargar los destinatarios de tus preguntas.")
  return questions.map(question => {
    const profile = profiles.data?.find(candidate => candidate.id === question.profileId)
    return { ...question, recipient: profile ? {
      displayName: profile.display_name || "Perfil sin nombre", username: profile.username || null,
    } : null }
  })
}

export async function fetchUnreadQuestionCount(profileId: string, accessToken?: string): Promise<number> {
  const query = supabase
    .from("profile_questions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "unread")
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { count, error } = await query

  if (error || count === null) throw new Error("No se pudieron contar las preguntas sin leer.")
  return count
}

export async function markQuestionRead(questionId: string, inbox: { profileId: string; accessToken: string }): Promise<void> {
  if (!inbox.profileId || !inbox.accessToken) throw new Error("Sesión no disponible.")
  const { data, error } = await supabase.from("profile_questions")
    .update({ status: "read" }).eq("id", questionId).eq("profile_id", inbox.profileId)
    .eq("status", "unread").select("id").single()
    .setHeader("Authorization", `Bearer ${inbox.accessToken}`)
  if (error || !data) throw new Error("No se pudo confirmar que la pregunta se marcó como leída.")
}

import { supabase } from "@/lib/supabase"
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset"

export const SENT_CREDITS_PAGE_SIZE = 30
export type SentCreditRequest = {
  id: string; song_title: string; role: string; status: string
  created_at: string; withdrawn_at: string | null
}

async function captureAccount(expectedUserId?: string) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || (expectedUserId && expectedUserId !== data.session.user.id)) {
    throw new Error("La sesión cambió. Actualiza las solicitudes.")
  }
  return { userId: data.session.user.id, token: data.session.access_token }
}

export async function fetchSentCreditRequests(cursor: CursorFeed | null, signal: AbortSignal) {
  const account = await captureAccount()
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  const profiles = await supabase.from("profiles").select("id").eq("user_id", account.userId)
    .setHeader("Authorization", `Bearer ${account.token}`).abortSignal(requestSignal)
  if (profiles.error) throw new Error("No se pudieron cargar los perfiles.")
  const ids = (profiles.data ?? []).map(profile => profile.id)
  if (!ids.length) return { userId: account.userId, rows: [] as SentCreditRequest[] }
  let query = supabase.from("credit_requests")
    .select("id, song_title, role, status, created_at, withdrawn_at")
    .in("requester_profile_id", ids).order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(SENT_CREDITS_PAGE_SIZE).setHeader("Authorization", `Bearer ${account.token}`).abortSignal(requestSignal)
  if (cursor) query = query.or(expresionKeyset(cursor))
  const { data, error } = await query
  if (error) throw new Error("No se pudieron cargar las solicitudes enviadas.")
  return { userId: account.userId, rows: (data ?? []) as SentCreditRequest[] }
}

export async function withdrawCreditRequest(id: string, expectedUserId: string) {
  const account = await captureAccount(expectedUserId)
  const { data, error } = await supabase.rpc("withdraw_credit_request", { p_request_id: id })
    .setHeader("Authorization", `Bearer ${account.token}`)
    .abortSignal(AbortSignal.timeout(15_000))
  if (error || data !== true) throw new Error("No se pudo confirmar la retirada. Actualiza la lista antes de volver a decidir.")
}

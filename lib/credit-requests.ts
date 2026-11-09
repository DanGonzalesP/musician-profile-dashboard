import { supabase } from "@/lib/supabase"
import type { CreditItem, CreditStatus } from "@/lib/blocks"
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset"

const CREDIT_REQUEST_TIMEOUT_MS = 15_000

// Flujo de notificaciones del Bloque 4 (créditos "internos"): cuando un
// artista selecciona una canción de otro artista de la plataforma, se crea
// una fila "pending" acá. El dueño de la canción la ve en su panel de
// notificaciones (app/perfil/notificaciones) y decide aceptar/rechazar —
// solo entonces el crédito aparece en el perfil público del solicitante.
// El origen histórico está en supabase/legacy/credit_requests_table.sql; el
// esquema vigente vive en supabase/migrations/0000_baseline.sql.

export type CreditRequest = {
  id: string
  requesterProfileId: string
  requesterCreditId: string
  ownerProfileId: string
  songTitle: string
  songKey: string
  role: string
  status: CreditStatus
  createdAt: string
  requesterDisplayName: string
}

export async function createCreditRequest(params: {
  requesterProfileId: string
  requesterCreditId: string
  ownerProfileId: string
  songTitle: string
  songKey: string
  role: string
}): Promise<{ id: string; status: CreditStatus }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error("Inicia sesión para solicitar un crédito.")
  const token = sessionData.session.access_token
  const payload = {
    requester_profile_id: params.requesterProfileId,
    requester_credit_id: params.requesterCreditId,
    owner_profile_id: params.ownerProfileId,
    song_title: params.songTitle,
    song_key: params.songKey,
    role: params.role,
  }
  // UUID v8 derivado del contenido: sobrevive recargas y respuestas perdidas.
  // La PK existente serializa reintentos sin reemplazar una decisión previa.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(["vibe-credit-request-v1", payload]))))
  digest[6] = (digest[6] & 0x0f) | 0x80
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("")
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  const columns = "id, status, withdrawn_at, requester_profile_id, requester_credit_id, owner_profile_id, song_title, song_key, role"
  const matches = (value: unknown): value is { id: string; status: CreditStatus } => {
    if (!value || typeof value !== "object") return false
    const row = value as Record<string, unknown>
    return row.id === id && row.withdrawn_at === null && ["pending", "accepted", "rejected"].includes(String(row.status)) &&
      Object.entries(payload).every(([key, expected]) => row[key] === expected)
  }
  const result = await Promise.resolve(supabase.from("credit_requests")
    .insert({ id, ...payload }).select(columns).abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS)).single()
    .setHeader("Authorization", `Bearer ${token}`))
    .catch(() => ({ data: null, error: true }))
  let saved: unknown = result.error ? null : result.data
  if (!matches(saved)) {
    const previous = await Promise.resolve(supabase.from("credit_requests").select(columns)
      .eq("id", id).eq("requester_profile_id", params.requesterProfileId)
      // La confirmación tiene su propio plazo: la escritura pudo completarse
      // aunque su respuesta no llegara. Reutilizar su señal impediría leerla.
      .abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS)).maybeSingle()
      .setHeader("Authorization", `Bearer ${token}`))
      .catch(() => ({ data: null, error: true }))
    saved = previous.error ? null : previous.data
    if (!matches(saved)) throw new Error("No se pudo confirmar la solicitud. Revisa tus colaboraciones enviadas antes de volver a solicitarla.")
  }
  return { id: saved.id, status: saved.status }
}

export async function fetchVerifiedCreditStatus(profileId: string, credit: CreditItem): Promise<CreditStatus> {
  if (!credit.requestId || !credit.ownerProfileId || !credit.songKey || credit.sourceType !== "internal") {
    throw new Error("Este crédito no tiene una solicitud vinculada.")
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error("Inicia sesión para consultar el crédito.")
  const { data, error } = await supabase.from("credit_requests").select("status")
    .eq("id", credit.requestId).eq("requester_profile_id", profileId)
    .eq("requester_credit_id", credit.id).eq("owner_profile_id", credit.ownerProfileId)
    .eq("song_key", credit.songKey).eq("song_title", credit.title).eq("role", credit.role)
    .is("withdrawn_at", null)
    .abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS)).maybeSingle().setHeader("Authorization", `Bearer ${sessionData.session.access_token}`)
  if (error || !data || !["pending", "accepted", "rejected"].includes(data.status)) {
    throw new Error("No se pudo comprobar una solicitud para los datos actuales del crédito.")
  }
  return data.status as CreditStatus
}

export const CREDIT_REQUESTS_PAGE_SIZE = 50

export async function fetchPendingCreditRequestCount(ownerProfileId: string, accessToken?: string): Promise<number> {
  const query = supabase.from("credit_requests")
    .select("id", { count: "exact", head: true }).eq("owner_profile_id", ownerProfileId).eq("status", "pending")
    .is("withdrawn_at", null)
    .abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS))
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { count, error } = await query
  if (error || count === null) throw new Error("No se pudieron contar las solicitudes pendientes.")
  return count
}

export async function fetchIncomingCreditRequests(ownerProfileId: string, cursor?: CursorFeed | null, accessToken?: string): Promise<CreditRequest[]> {
  let query = supabase
    .from("credit_requests")
    .select(
      "id, requester_profile_id, requester_credit_id, owner_profile_id, song_title, song_key, role, status, created_at, profiles!credit_requests_requester_profile_id_fkey(display_name)"
    )
    .eq("owner_profile_id", ownerProfileId)
    .is("withdrawn_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(CREDIT_REQUESTS_PAGE_SIZE)
    .abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS))
  if (cursor) query = query.or(expresionKeyset(cursor))
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data, error } = await query

  if (error) throw new Error("No se pudieron cargar las solicitudes de crédito.")

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string
      requester_profile_id: string
      requester_credit_id: string
      owner_profile_id: string
      song_title: string
      song_key: string
      role: string
      status: CreditStatus
      created_at: string
      profiles: { display_name: string | null } | null
    }
    return {
      id: r.id,
      requesterProfileId: r.requester_profile_id,
      requesterCreditId: r.requester_credit_id,
      ownerProfileId: r.owner_profile_id,
      songTitle: r.song_title,
      songKey: r.song_key,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
      requesterDisplayName: r.profiles?.display_name || "Artista",
    }
  })
}

export async function resolveCreditRequest(requestId: string, decision: "accepted" | "rejected", inbox: { profileId: string; accessToken: string }): Promise<void> {
  if (!inbox.profileId || !inbox.accessToken) throw new Error("Sesión no disponible.")
  const { data, error } = await supabase
    .from("credit_requests")
    .update({ status: decision, resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("owner_profile_id", inbox.profileId)
    .eq("status", "pending")
    .is("withdrawn_at", null)
    .select("id")
    .abortSignal(AbortSignal.timeout(CREDIT_REQUEST_TIMEOUT_MS)).single()
    .setHeader("Authorization", `Bearer ${inbox.accessToken}`)

  if (error || !data) throw new Error("No se pudo confirmar la decisión. Recarga las solicitudes antes de volver a decidir.")
}

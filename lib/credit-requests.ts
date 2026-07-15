import { supabase } from "@/lib/supabase"
import type { CreditStatus } from "@/lib/blocks"

// Flujo de notificaciones del Bloque 4 (créditos "internos"): cuando un
// artista selecciona una canción de otro artista de la plataforma, se crea
// una fila "pending" acá. El dueño de la canción la ve en su panel de
// notificaciones (app/perfil/notificaciones) y decide aceptar/rechazar —
// solo entonces el crédito aparece en el perfil público del solicitante.
// Ver supabase/credit_requests_table.sql para el esquema y las políticas RLS.

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
  const { data, error } = await supabase
    .from("credit_requests")
    .insert({
      requester_profile_id: params.requesterProfileId,
      requester_credit_id: params.requesterCreditId,
      owner_profile_id: params.ownerProfileId,
      song_title: params.songTitle,
      song_key: params.songKey,
      role: params.role,
    })
    .select("id, status")
    .single()

  if (error) throw error
  return { id: String(data.id), status: data.status as CreditStatus }
}

export async function fetchCreditRequestStatuses(ids: string[]): Promise<Record<string, CreditStatus>> {
  if (ids.length === 0) return {}

  const { data, error } = await supabase.from("credit_requests").select("id, status").in("id", ids)
  if (error) throw error

  const map: Record<string, CreditStatus> = {}
  for (const row of data ?? []) map[String(row.id)] = row.status as CreditStatus
  return map
}

export async function fetchIncomingCreditRequests(ownerProfileId: string): Promise<CreditRequest[]> {
  const { data, error } = await supabase
    .from("credit_requests")
    .select(
      "id, requester_profile_id, requester_credit_id, owner_profile_id, song_title, song_key, role, status, created_at, profiles!credit_requests_requester_profile_id_fkey(display_name)"
    )
    .eq("owner_profile_id", ownerProfileId)
    .order("created_at", { ascending: false })

  if (error) throw error

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

export async function resolveCreditRequest(requestId: string, decision: "accepted" | "rejected"): Promise<void> {
  const { error } = await supabase
    .from("credit_requests")
    .update({ status: decision, resolved_at: new Date().toISOString() })
    .eq("id", requestId)

  if (error) throw error
}

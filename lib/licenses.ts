import { supabase } from "@/lib/supabase"

export type LicenseHistoryEntry = {
  id: number
  organizerName: string
  eventDate: string
  eventEndDate: string | null
  songs: string[]
  artistName: string
  artistLegalName: string | null
  artistDni: string | null
  createdAt: string
}

export type RecordLicenseInput = {
  artistName: string
  artistLegalName: string
  artistDni: string
  organizerName: string
  eventDate: string
  eventEndDate?: string
  songs: string[]
}

/**
 * Registra los datos declarados para un borrador, nunca el PDF firmado.
 * La redescarga usa la plantilla vigente y una fecha de generación nueva;
 * no es una copia idéntica ni prueba de aceptación de las partes.
 */
export async function recordLicense(profileId: string, input: RecordLicenseInput, expectedUserId?: string): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getSession()
  if (authError || !auth.session || (expectedUserId && auth.session.user.id !== expectedUserId)) {
    throw new Error("La sesión cambió. No se pudo registrar la licencia.")
  }
  const { error } = await supabase.from("licenses").insert({
    profile_id: profileId,
    artist_name: input.artistName,
    artist_legal_name: input.artistLegalName || null,
    artist_dni: input.artistDni || null,
    organizer_name: input.organizerName,
    event_date: input.eventDate,
    event_end_date: input.eventEndDate || null,
    songs: input.songs,
  }).setHeader("Authorization", `Bearer ${auth.session.access_token}`)
  if (error) throw new Error("No se pudo confirmar el registro de la licencia.")
}

export type LicenseHistoryPage = { entries: LicenseHistoryEntry[]; nextCursor: number | null }
const HISTORY_PAGE_SIZE = 30

export async function fetchLicenseHistory(profileId: string, expectedUserId?: string, beforeId?: number, signal?: AbortSignal): Promise<LicenseHistoryPage> {
  if (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    throw new Error("No se pudo continuar el historial. Vuelve a cargarlo.")
  }
  const { data: auth, error: authError } = await supabase.auth.getSession()
  if (authError || !auth.session || (expectedUserId && auth.session.user.id !== expectedUserId)) {
    throw new Error("La sesión cambió. Vuelve a abrir el historial.")
  }
  signal?.throwIfAborted()
  const query = supabase
    .from("licenses")
    .select(
      "id, organizer_name, event_date, event_end_date, songs, artist_name, artist_legal_name, artist_dni, created_at"
    )
    .eq("profile_id", profileId)
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE_SIZE + 1)
    .setHeader("Authorization", `Bearer ${auth.session.access_token}`)
  if (beforeId !== undefined) query.lt("id", beforeId)
  if (signal) query.abortSignal(signal)
  const { data, error } = await query

  if (error) throw new Error("No se pudo cargar el historial de licencias.")

  const entries = (data ?? []).slice(0, HISTORY_PAGE_SIZE).map((row) => ({
    id: row.id,
    organizerName: row.organizer_name,
    eventDate: row.event_date,
    eventEndDate: row.event_end_date,
    songs: Array.isArray(row.songs) ? row.songs : [],
    artistName: row.artist_name,
    artistLegalName: row.artist_legal_name,
    artistDni: row.artist_dni,
    createdAt: row.created_at,
  }))
  return {
    entries,
    nextCursor: (data?.length ?? 0) > HISTORY_PAGE_SIZE ? entries[entries.length - 1].id : null,
  }
}

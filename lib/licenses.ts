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
 * Registra en Supabase que se generó una licencia — solo texto/jsonb, nunca
 * el PDF. El PDF es una función pura de estos mismos datos, así que puede
 * regenerarse idéntico más tarde sin necesidad de guardar el binario.
 */
export async function recordLicense(profileId: string, input: RecordLicenseInput): Promise<void> {
  const { error } = await supabase.from("licenses").insert({
    profile_id: profileId,
    artist_name: input.artistName,
    artist_legal_name: input.artistLegalName || null,
    artist_dni: input.artistDni || null,
    organizer_name: input.organizerName,
    event_date: input.eventDate,
    event_end_date: input.eventEndDate || null,
    songs: input.songs,
  })
  if (error) throw error
}

export async function fetchLicenseHistory(profileId: string): Promise<LicenseHistoryEntry[]> {
  const { data, error } = await supabase
    .from("licenses")
    .select(
      "id, organizer_name, event_date, event_end_date, songs, artist_name, artist_legal_name, artist_dni, created_at"
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
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
}

import { supabase } from "@/lib/supabase"

export type LegalSettings = {
  artistLegalName: string
  artistStageName: string
  artistDni: string
}

export const emptyLegalSettings: LegalSettings = {
  artistLegalName: "",
  artistStageName: "",
  artistDni: "",
}

export async function fetchLegalSettings(profileId: string): Promise<LegalSettings> {
  const { data, error } = await supabase
    .from("profiles")
    .select("legal_settings")
    .eq("id", profileId)
    .maybeSingle()

  if (error) throw error
  const raw = (data?.legal_settings ?? {}) as Partial<LegalSettings>
  return {
    artistLegalName: raw.artistLegalName ?? "",
    artistStageName: raw.artistStageName ?? "",
    artistDni: raw.artistDni ?? "",
  }
}

export async function saveLegalSettings(profileId: string, settings: LegalSettings): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ legal_settings: settings })
    .eq("id", profileId)

  if (error) throw error
}

import { supabase } from "@/lib/supabase"

// Nombre legal y DNI del artista para la Licencia Express.
//
// Viven en `profile_private`, NO en `profiles`: la tabla de perfiles tiene
// lectura pública (la necesitan el perfil público y el feed), así que tener
// el DNI ahí significaba que cualquiera con la anon key —que va en el bundle
// del navegador— podía volcarlos con un solo GET. Ver
// supabase/migrations/0003_profile_private.sql.

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
    .from("profile_private")
    .select("legal_settings")
    .eq("profile_id", profileId)
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
  // upsert y no update: la fila privada puede no existir todavía (un perfil
  // recién creado no tiene borrador ni datos legales).
  const { error } = await supabase
    .from("profile_private")
    .upsert({ profile_id: profileId, legal_settings: settings, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" })

  if (error) throw error
}

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

async function legalSession(expectedUserId?: string) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || (expectedUserId && data.session.user.id !== expectedUserId)) {
    throw new Error("La sesión cambió. Recarga los datos legales antes de continuar.")
  }
  return data.session.access_token
}

export async function fetchLegalSettings(profileId: string, expectedUserId?: string): Promise<LegalSettings> {
  const token = await legalSession(expectedUserId)
  const { data, error } = await supabase
    .from("profile_private")
    .select("legal_settings")
    .eq("profile_id", profileId)
    .maybeSingle()
    .setHeader("Authorization", `Bearer ${token}`)

  if (error) throw new Error("No se pudieron cargar los datos legales.")
  const raw = (data?.legal_settings ?? {}) as Partial<LegalSettings>
  if (typeof raw !== "object" || Array.isArray(raw) ||
    [raw.artistLegalName, raw.artistStageName, raw.artistDni].some(value => value != null && typeof value !== "string")) {
    throw new Error("No se pudieron interpretar los datos legales guardados.")
  }
  return {
    artistLegalName: raw.artistLegalName ?? "",
    artistStageName: raw.artistStageName ?? "",
    artistDni: raw.artistDni ?? "",
  }
}

export async function saveLegalSettings(profileId: string, settings: LegalSettings, expectedUserId?: string): Promise<void> {
  const token = await legalSession(expectedUserId)
  // upsert y no update: la fila privada puede no existir todavía (un perfil
  // recién creado no tiene borrador ni datos legales).
  const { error } = await supabase
    .from("profile_private")
    .upsert({ profile_id: profileId, legal_settings: settings, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" })
    .setHeader("Authorization", `Bearer ${token}`)

  if (error) throw new Error("No se pudo confirmar el guardado de los datos legales.")
}

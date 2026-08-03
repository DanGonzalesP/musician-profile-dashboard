import { supabase } from "@/lib/supabase"

// Borrador del editor visual (bloques + productos + servicios sin publicar).
//
// Vive en `profile_private`, NO en `profiles`: la tabla de perfiles tiene
// lectura pública, así que tener el borrador ahí significaba que cualquiera
// podía leer el trabajo sin publicar de todos los artistas de la plataforma
// con la anon key. Ver supabase/migrations/0003_profile_private.sql.
//
// Se centraliza acá el acceso para que el editor, la vista previa y el
// publish usen exactamente la misma forma de leer/escribir.

export type DraftContent = {
  blocks?: unknown[]
  products?: unknown[]
  services?: unknown[]
}

/**
 * Lee el borrador de un perfil. Devuelve null si no hay borrador guardado.
 *
 * Nunca lanza por "la tabla no existe": si la migración 0003 todavía no
 * corrió, se registra en consola y se devuelve null — lo publicado sigue
 * cargando normalmente, que es el comportamiento que ya tenía el editor.
 */
export async function fetchDraft(profileId: string): Promise<DraftContent | null> {
  const { data, error } = await supabase
    .from("profile_private")
    .select("draft_content")
    .eq("profile_id", profileId)
    .maybeSingle()

  if (error) {
    console.error("No se pudo leer el borrador (¿falta correr 0003_profile_private.sql?):", error)
    return null
  }

  return (data?.draft_content as DraftContent | null) ?? null
}

/**
 * Guarda (o reemplaza) el borrador. upsert porque la fila privada puede no
 * existir todavía para un perfil recién creado.
 */
export async function saveDraft(profileId: string, draft: DraftContent): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("profile_private")
    .upsert(
      { profile_id: profileId, draft_content: draft, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    )

  return { error: error ? new Error(error.message) : null }
}

/**
 * Limpia el borrador tras publicar. Se separa de saveDraft para dejar
 * explícito en el llamador que esto es parte del ciclo de publicación.
 */
export async function clearDraft(profileId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("profile_private")
    .upsert(
      { profile_id: profileId, draft_content: null, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    )

  return { error: error ? new Error(error.message) : null }
}

import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

// Garantiza que la cuenta autenticada tenga su fila en `profiles`.
//
// Antes, una cuenta nueva quedaba sin perfil propio y toda la app caía al
// perfil semilla PROFILE_ID — con dos usuarios reales eso colisionaba (o
// RLS lo bloqueaba). Ahora hay doble red: un trigger en la base de datos
// crea el perfil al registrarse (supabase/setup_vibra.sql) y este helper
// lo repone desde el cliente si el trigger aún no está instalado.

export type OwnProfile = {
  id: string
  displayName: string
  unifiedProfile: boolean
}

export async function ensureOwnProfile(user: User): Promise<OwnProfile | null> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, display_name, unified_profile")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing) {
    return {
      id: existing.id,
      displayName: existing.display_name || "",
      unifiedProfile: Boolean(existing.unified_profile),
    }
  }

  const defaultName = user.email?.split("@")[0] || "artista"

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, profile_type: "artist", display_name: defaultName })
    .select("id, display_name, unified_profile")
    .single()

  if (error) {
    // Carrera benigna: el trigger de la DB pudo haberla creado en paralelo.
    const { data: retry } = await supabase
      .from("profiles")
      .select("id, display_name, unified_profile")
      .eq("user_id", user.id)
      .maybeSingle()
    if (retry) {
      return {
        id: retry.id,
        displayName: retry.display_name || "",
        unifiedProfile: Boolean(retry.unified_profile),
      }
    }
    console.error("No se pudo crear el perfil del usuario:", error)
    return null
  }

  return {
    id: created.id,
    displayName: created.display_name || "",
    unifiedProfile: Boolean(created.unified_profile),
  }
}

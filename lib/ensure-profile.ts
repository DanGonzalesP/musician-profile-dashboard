import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { slugifyUsername } from "@/lib/username"

// Garantiza que la cuenta autenticada tenga su fila en `profiles`.
//
// Antes, una cuenta nueva quedaba sin perfil propio y toda la app caía al
// perfil semilla PROFILE_ID — con dos usuarios reales eso colisionaba (o
// RLS lo bloqueaba). Ahora hay doble red: un trigger en la base de datos
// crea el perfil al registrarse (origen: supabase/legacy/setup_vibra.sql) y este helper
// lo repone desde el cliente si el trigger aún no está instalado.

export type OwnProfile = {
  id: string
  /** Identidad pública del perfil: es lo que va en la URL. Ver lib/username.ts. */
  username: string
  displayName: string
  unifiedProfile: boolean
}

/**
 * Devuelve el id de perfil del usuario autenticado, creándolo si hiciera
 * falta. Lanza si no se pudo resolver.
 *
 * Reemplaza al patrón `profile?.id ?? PROFILE_ID` que estaba repetido por
 * toda la app. Ese fallback al perfil semilla hacía que cualquier cuenta sin
 * fila propia —y, en las pantallas sin guard, cualquier visitante anónimo—
 * terminara leyendo y ESCRIBIENDO sobre el mismo perfil compartido. Ver
 * AUDITORIA.md §9.
 */
export async function resolveOwnProfileId(user: User): Promise<string> {
  const profile = await ensureOwnProfile(user)
  if (!profile) {
    throw new Error("No se pudo resolver tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.")
  }
  return profile.id
}

export async function ensureOwnProfile(user: User): Promise<OwnProfile | null> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, username, display_name, unified_profile")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing) {
    return {
      id: existing.id,
      username: existing.username ?? "",
      displayName: existing.display_name || "",
      unifiedProfile: Boolean(existing.unified_profile),
    }
  }

  const defaultName = user.email?.split("@")[0] || "artista"
  // username es NOT NULL y unico desde 0006_username.sql. Se deriva del
  // correo y se le agrega un sufijo aleatorio corto para que dos cuentas con
  // el mismo prefijo (ana@gmail / ana@hotmail) no choquen en el alta. El
  // artista puede cambiarlo después desde configuración.
  const baseUsername = slugifyUsername(defaultName) || "artista"
  const defaultUsername = `${baseUsername.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({
      user_id: user.id,
      profile_type: "artist",
      display_name: defaultName,
      username: defaultUsername,
    })
    .select("id, username, display_name, unified_profile")
    .single()

  if (error) {
    // Carrera benigna: el trigger de la DB pudo haberla creado en paralelo.
    const { data: retry } = await supabase
      .from("profiles")
      .select("id, username, display_name, unified_profile")
      .eq("user_id", user.id)
      .maybeSingle()
    if (retry) {
      return {
        id: retry.id,
        username: retry.username ?? "",
        displayName: retry.display_name || "",
        unifiedProfile: Boolean(retry.unified_profile),
      }
    }
    console.error("No se pudo crear el perfil del usuario:", error)
    return null
  }

  return {
    id: created.id,
    username: created.username ?? "",
    displayName: created.display_name || "",
    unifiedProfile: Boolean(created.unified_profile),
  }
}

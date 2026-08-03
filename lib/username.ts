import { supabase } from "@/lib/supabase"

// Identidad pública de un perfil.
//
// Antes la URL se resolvía con  .ilike("display_name", slug.replaceAll("-", " ")),
// lo que traía cinco problemas de golpe (ver supabase/migrations/0006_username.sql):
// display_name no es único, ilike interpreta los comodines % y _ que vienen
// crudos de la URL, no había palabras reservadas, renombrarse rompía todos
// los enlaces compartidos, y el slug era ambiguo.
//
// Ahora la URL contiene un `username` real: único, validado y con historial.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/

/**
 * Normaliza un texto libre a un username candidato. Misma lógica que el
 * backfill de la migración, para que lo que sugiere el registro coincida con
 * lo que produjo la base.
 */
export function slugifyUsername(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFD")
    // Quita los diacríticos que la descomposición NFD dejó sueltos, para
    // que "jose" salga de "José" en vez de perder la letra. Se escribe con
    // escapes unicode y no con los caracteres combinantes literales: esos
    // son invisibles en el fuente y se corrompen con cualquier reencodeo.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  return base.slice(0, 30)
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}

export type ResolvedProfile = {
  id: string
  username: string
  displayName: string
  profileType: string
  unifiedProfile: boolean
  /** Si el username pedido era uno antiguo, este es el actual (para redirigir). */
  redirectTo?: string
}

/**
 * Resuelve un username de la URL a un perfil.
 *
 * Busca por igualdad exacta (nunca ilike: el valor viene de la URL y los
 * comodines de LIKE no deben interpretarse). Si no existe, prueba en
 * username_history para que los enlaces y QR ya compartidos sigan llevando
 * al lugar correcto.
 */
export async function resolveProfileByUsername(rawUsername: string): Promise<ResolvedProfile | null> {
  const username = rawUsername.trim().toLowerCase()
  if (!isValidUsername(username)) return null

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, profile_type, unified_profile")
    .eq("username", username)
    .maybeSingle()

  if (error) throw error

  if (profile) {
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name ?? "",
      profileType: profile.profile_type ?? "artist",
      unifiedProfile: Boolean(profile.unified_profile),
    }
  }

  // ¿Es un username antiguo? Se busca el perfil que lo tuvo y se devuelve
  // con redirectTo para que la página haga el redirect al actual.
  const { data: historic } = await supabase
    .from("username_history")
    .select("profile_id")
    .eq("old_username", username)
    .maybeSingle()

  if (!historic) return null

  const { data: current } = await supabase
    .from("profiles")
    .select("id, username, display_name, profile_type, unified_profile")
    .eq("id", historic.profile_id)
    .maybeSingle()

  if (!current) return null

  return {
    id: current.id,
    username: current.username,
    displayName: current.display_name ?? "",
    profileType: current.profile_type ?? "artist",
    unifiedProfile: Boolean(current.unified_profile),
    redirectTo: current.username,
  }
}

/**
 * ¿Está libre este username? Se usa en el registro y en configuración.
 * Comprueba también el historial, para no "robar" un enlace que todavía
 * redirige al perfil de otra persona.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!isValidUsername(username)) return false

  const [{ data: taken }, { data: historic }, { data: reserved }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", username).maybeSingle(),
    supabase.from("username_history").select("profile_id").eq("old_username", username).maybeSingle(),
    supabase.from("reserved_usernames").select("name").eq("name", username).maybeSingle(),
  ])

  return !taken && !historic && !reserved
}

import type { SupabaseClient } from "@supabase/supabase-js"

export type PlatformPermission = "maintenance" | "moderation" | "roles"

/** Comprueba el permiso de la sesión autenticada mediante auth.uid() en la RPC. */
export async function hasPlatformPermission(
  supabase: SupabaseClient,
  permission: PlatformPermission
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("has_platform_permission", {
      p_permission: permission,
    })
    return error === null && data === true
  } catch {
    return false
  }
}

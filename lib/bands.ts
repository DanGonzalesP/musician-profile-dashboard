import { supabase } from "@/lib/supabase"

// Punto 4: perfiles de banda + roles de gestión. Una banda es otra fila de
// `profiles` (profile_type = "band"); quién puede editarla se resuelve acá y
// se refleja también en RLS vía get_profile_role() — ver
// supabase/band_profiles.sql. "owner" es el creador de la banda (o el dueño
// de un perfil personal); "admin"/"editor" son roles de band_members.
export type BandRole = "owner" | "admin" | "editor"

export type MyProfileOption = {
  id: string
  displayName: string
  isBand: boolean
  role: BandRole
}

export type BandMember = {
  membershipId: string
  memberUserId: string
  displayName: string
  role: "admin" | "editor"
  status: "pending" | "accepted" | "declined"
}

export type PendingInvite = {
  membershipId: string
  bandProfileId: string
  bandDisplayName: string
  role: "admin" | "editor"
}

const ACTIVE_BAND_KEY_PREFIX = "amplitude:activeBandId:"

/** Banda seleccionada en el switcher para este usuario (o null = perfil personal). */
export function getActiveBandId(userId: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACTIVE_BAND_KEY_PREFIX + userId)
}

export function setActiveBandId(userId: string, bandProfileId: string | null): void {
  if (typeof window === "undefined") return
  if (bandProfileId) {
    window.localStorage.setItem(ACTIVE_BAND_KEY_PREFIX + userId, bandProfileId)
  } else {
    window.localStorage.removeItem(ACTIVE_BAND_KEY_PREFIX + userId)
  }
}

/**
 * Rol efectivo del usuario sobre una banda puntual — usado para validar la
 * selección del switcher antes de usarla (si ya no es válida, ej. el dueño
 * quitó al miembro, cae de vuelta al perfil personal).
 */
export async function getEffectiveBandRole(bandProfileId: string, userId: string): Promise<BandRole | null> {
  const { data: band } = await supabase
    .from("profiles")
    .select("owner_user_id")
    .eq("id", bandProfileId)
    .maybeSingle()

  if (band?.owner_user_id === userId) return "owner"

  const { data: membership } = await supabase
    .from("band_members")
    .select("role, status")
    .eq("band_profile_id", bandProfileId)
    .eq("member_user_id", userId)
    .eq("status", "accepted")
    .maybeSingle()

  return (membership?.role as BandRole | undefined) ?? null
}

/** Perfil personal + todas las bandas donde el usuario es dueño o miembro aceptado — para el switcher. */
export async function fetchMyProfiles(userId: string): Promise<MyProfileOption[]> {
  const options: MyProfileOption[] = []

  const { data: personal } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("user_id", userId)
    .eq("profile_type", "artist")
    .maybeSingle()

  if (personal) {
    options.push({ id: personal.id, displayName: personal.display_name || "Mi Perfil", isBand: false, role: "owner" })
  }

  const { data: ownedBands } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("owner_user_id", userId)
    .eq("profile_type", "band")

  for (const band of ownedBands ?? []) {
    options.push({ id: band.id, displayName: band.display_name || "Grupo sin nombre", isBand: true, role: "owner" })
  }

  const { data: memberships } = await supabase
    .from("band_members")
    .select("role, profiles!band_members_band_profile_id_fkey(id, display_name)")
    .eq("member_user_id", userId)
    .eq("status", "accepted")

  for (const m of (memberships ?? []) as unknown as { role: BandRole; profiles: { id: string; display_name: string | null } | null }[]) {
    if (!m.profiles) continue
    options.push({ id: m.profiles.id, displayName: m.profiles.display_name || "Grupo sin nombre", isBand: true, role: m.role })
  }

  return options
}

export async function createBand(userId: string, displayName: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .insert({ profile_type: "band", owner_user_id: userId, display_name: displayName })
    .select("id")
    .single()

  if (error) throw error
  return data.id as string
}

export async function fetchBandMembers(bandProfileId: string): Promise<BandMember[]> {
  const { data, error } = await supabase
    .from("band_members")
    .select("id, member_user_id, role, status, invited_username")
    .eq("band_profile_id", bandProfileId)
    .order("created_at", { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    membershipId: row.id as string,
    memberUserId: row.member_user_id as string,
    displayName: (row.invited_username as string | null) || "Artista",
    role: row.role as "admin" | "editor",
    status: row.status as "pending" | "accepted" | "declined",
  }))
}

/** Invita por @username (profiles.display_name) — solo perfiles personales, no otras bandas. */
export async function inviteMember(bandProfileId: string, username: string, role: "admin" | "editor"): Promise<void> {
  const cleanUsername = username.trim().replace(/^@/, "")
  if (!cleanUsername) throw new Error("Escribe un nombre de usuario.")

  // El @usuario suele escribirse con guiones ("nova-reyes") pero el
  // display_name real lleva espacios ("Nova Reyes"). Se prueban ambas
  // formas y se toma el primer perfil personal con cuenta real — sin
  // maybeSingle(), que reventaba si dos perfiles compartían nombre.
  const patterns = [cleanUsername, cleanUsername.replaceAll("-", " ")]
  let target: { id: string; user_id: string | null; display_name: string | null } | null = null

  for (const pattern of patterns) {
    const { data, error: lookupError } = await supabase
      .from("profiles")
      .select("id, user_id, display_name")
      .eq("profile_type", "artist")
      .ilike("display_name", pattern)
      .limit(5)
    if (lookupError) throw lookupError
    target = (data ?? []).find((p) => p.user_id) ?? null
    if (target) break
  }

  if (!target?.user_id) {
    throw new Error(
      `No se encontró ningún artista con el usuario @${cleanUsername}. Pídele que se registre y elija su nombre de artista en Configuración.`
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user && target.user_id === user.id) {
    throw new Error("Ya eres parte del grupo como creador — no necesitas invitarte.")
  }

  const { error } = await supabase.from("band_members").insert({
    band_profile_id: bandProfileId,
    member_user_id: target.user_id,
    role,
    invited_username: target.display_name,
  })

  if (error) {
    // 23505 = unique (band_profile_id, member_user_id): ya estaba invitado.
    if (error.code === "23505") {
      throw new Error(`@${cleanUsername} ya tiene una invitación a este grupo.`)
    }
    if (error.message.includes("row-level security")) {
      throw new Error(
        "Supabase rechazó la invitación: falta correr supabase/setup_decima.sql en el proyecto."
      )
    }
    throw error
  }
}

export async function updateMemberRole(membershipId: string, role: "admin" | "editor"): Promise<void> {
  const { error } = await supabase.from("band_members").update({ role }).eq("id", membershipId)
  if (error) throw error
}

export async function removeMember(membershipId: string): Promise<void> {
  const { error } = await supabase.from("band_members").delete().eq("id", membershipId)
  if (error) throw error
}

export async function fetchMyPendingInvites(userId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from("band_members")
    .select("id, band_profile_id, role, profiles!band_members_band_profile_id_fkey(display_name)")
    .eq("member_user_id", userId)
    .eq("status", "pending")

  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as unknown as { id: string; band_profile_id: string; role: "admin" | "editor"; profiles: { display_name: string | null } | null }
    return {
      membershipId: r.id,
      bandProfileId: r.band_profile_id,
      bandDisplayName: r.profiles?.display_name || "Grupo sin nombre",
      role: r.role,
    }
  })
}

export async function respondToInvite(membershipId: string, decision: "accepted" | "declined"): Promise<void> {
  const { error } = await supabase.from("band_members").update({ status: decision }).eq("id", membershipId)
  if (error) throw error
}

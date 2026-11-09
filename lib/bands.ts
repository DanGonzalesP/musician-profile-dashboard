import { supabase } from "@/lib/supabase"
import { slugifyUsername } from "@/lib/username"

// Punto 4: perfiles de banda + roles de gestión. Una banda es otra fila de
// `profiles` (profile_type = "band"); quién puede editarla se resuelve acá y
// se refleja también en RLS vía get_profile_role() — ver
// supabase/legacy/band_profiles.sql. "owner" es el creador de la banda (o el dueño
// de un perfil personal); "admin"/"editor" son roles de band_members.
export type BandRole = "owner" | "admin" | "editor"

export type MyProfileOption = {
  id: string
  displayName: string
  // Identidad pública real (lo que va en la URL /[username]) — NO se deriva
  // del nombre: el username lleva un sufijo aleatorio, así que slugificar el
  // display_name nunca coincide con él. Ver lib/username.ts y ensure-profile.ts.
  username: string
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
export async function getEffectiveBandRole(bandProfileId: string, userId: string, accessToken?: string): Promise<BandRole | null> {
  const bandQuery = supabase
    .from("profiles")
    .select("owner_user_id")
    .eq("id", bandProfileId)
    .maybeSingle()
  if (accessToken) bandQuery.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data: band, error: bandError } = await bandQuery

  if (bandError) throw new Error("No se pudo consultar el acceso al grupo.")
  if (band?.owner_user_id === userId) return "owner"

  const membershipQuery = supabase
    .from("band_members")
    .select("role, status")
    .eq("band_profile_id", bandProfileId)
    .eq("member_user_id", userId)
    .eq("status", "accepted")
    .maybeSingle()
  if (accessToken) membershipQuery.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data: membership, error: membershipError } = await membershipQuery

  if (membershipError) throw new Error("No se pudo consultar el acceso al grupo.")
  return (membership?.role as BandRole | undefined) ?? null
}

/** Perfil personal + todas las bandas donde el usuario es dueño o miembro aceptado — para el switcher. */
export async function fetchMyProfiles(userId: string, accessToken?: string): Promise<MyProfileOption[]> {
  const options: MyProfileOption[] = []

  const personalQuery = supabase
    .from("profiles")
    .select("id, display_name, username")
    .eq("user_id", userId)
    .eq("profile_type", "artist")
    .maybeSingle()
  if (accessToken) personalQuery.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data: personal, error: personalError } = await personalQuery

  if (personalError) throw new Error("No se pudieron cargar tus perfiles.")
  if (personal) {
    options.push({ id: personal.id, displayName: personal.display_name || "Mi Perfil", username: personal.username ?? "", isBand: false, role: "owner" })
  }

  const ownedQuery = supabase
    .from("profiles")
    .select("id, display_name, username")
    .eq("owner_user_id", userId)
    .eq("profile_type", "band")
  if (accessToken) ownedQuery.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data: ownedBands, error: ownedError } = await ownedQuery

  if (ownedError) throw new Error("No se pudieron cargar tus grupos.")
  for (const band of ownedBands ?? []) {
    options.push({ id: band.id, displayName: band.display_name || "Grupo sin nombre", username: band.username ?? "", isBand: true, role: "owner" })
  }

  const membershipsQuery = supabase
    .from("band_members")
    .select("role, profiles!band_members_band_profile_id_fkey(id, display_name, username)")
    .eq("member_user_id", userId)
    .eq("status", "accepted")
  if (accessToken) membershipsQuery.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data: memberships, error: membershipsError } = await membershipsQuery

  if (membershipsError) throw new Error("No se pudieron cargar tus grupos.")
  for (const m of (memberships ?? []) as unknown as { role: BandRole; profiles: { id: string; display_name: string | null; username: string | null } | null }[]) {
    if (!m.profiles || options.some(option => option.id === m.profiles?.id)) continue
    options.push({ id: m.profiles.id, displayName: m.profiles.display_name || "Grupo sin nombre", username: m.profiles.username ?? "", isBand: true, role: m.role })
  }

  return options
}

export async function createBand(userId: string, displayName: string): Promise<string> {
  // username es NOT NULL y único desde 0006_username.sql. Se deriva del nombre
  // del grupo con sufijo aleatorio para evitar choques entre bandas homónimas;
  // el dueño puede cambiarlo después desde configuración.
  const base = slugifyUsername(displayName) || "grupo"
  const username = `${base.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`

  const { data, error } = await supabase
    .from("profiles")
    .insert({ profile_type: "band", owner_user_id: userId, display_name: displayName, username })
    .select("id")
    .single()

  if (error) throw error
  return data.id as string
}

export async function fetchBandMembers(bandProfileId: string, accessToken?: string): Promise<BandMember[]> {
  const query = supabase
    .from("band_members")
    .select("id, member_user_id, role, status, invited_username")
    .eq("band_profile_id", bandProfileId)
    .order("created_at", { ascending: true })
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((row) => ({
    membershipId: row.id as string,
    memberUserId: row.member_user_id as string,
    displayName: (row.invited_username as string | null) || "Artista",
    role: row.role as "admin" | "editor",
    status: row.status as "pending" | "accepted" | "declined",
  }))
}

async function bandMutationAccount(expectedUserId?: string) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || (expectedUserId && data.session.user.id !== expectedUserId)) {
    throw new Error("La cuenta cambió. Vuelve a abrir el grupo con la cuenta original.")
  }
  return { userId: data.session.user.id, token: data.session.access_token }
}

/** Invita por @username real — solo perfiles personales, no otras bandas. */
export async function inviteMember(bandProfileId: string, username: string, role: "admin" | "editor", expectedUserId?: string): Promise<void> {
  const cleanUsername = username.trim().replace(/^@/, "")
  if (!cleanUsername) throw new Error("Escribe un nombre de usuario.")
  const account = await bandMutationAccount(expectedUserId)

  // Búsqueda por username EXACTO. Antes se hacía .ilike sobre display_name
  // probando variantes con guiones/espacios: eso podía invitar al artista
  // equivocado cuando dos compartían nombre, y los comodines % y _ del texto
  // escrito se interpretaban como patrón de búsqueda.
  const { data, error: lookupError } = await supabase
    .from("profiles")
    .select("id, user_id, display_name, username")
    .eq("profile_type", "artist")
    .eq("username", cleanUsername.toLowerCase())
    .maybeSingle()
    .setHeader("Authorization", `Bearer ${account.token}`)
  if (lookupError) throw lookupError

  const target = data?.user_id ? data : null

  if (!target?.user_id) {
    throw new Error(
      `No se encontró ningún artista con el usuario @${cleanUsername}. Pídele que se registre y elija su nombre de artista en Configuración.`
    )
  }

  if (target.user_id === account.userId) {
    throw new Error("Ya eres parte del grupo como creador — no necesitas invitarte.")
  }

  const { error } = await supabase.from("band_members").insert({
    band_profile_id: bandProfileId,
    member_user_id: target.user_id,
    role,
    invited_username: target.username,
  }).setHeader("Authorization", `Bearer ${account.token}`)

  if (error) {
    // 23505 = unique (band_profile_id, member_user_id): ya estaba invitado.
    if (error.code === "23505") {
      throw new Error(`@${cleanUsername} ya tiene una invitación a este grupo.`)
    }
    if (error.message.includes("row-level security")) {
      throw new Error(
        "Supabase rechazó la invitación. Verifica que las migraciones versionadas estén aplicadas."
      )
    }
    throw error
  }
}

export async function updateMemberRole(membershipId: string, role: "admin" | "editor", bandProfileId: string, expectedUserId?: string, previousRole?: "admin" | "editor"): Promise<void> {
  const account = await bandMutationAccount(expectedUserId)
  const query = supabase.from("band_members").update({ role })
    .eq("id", membershipId).eq("band_profile_id", bandProfileId).eq("status", "accepted").select("id")
    .setHeader("Authorization", `Bearer ${account.token}`)
  if (previousRole) query.eq("role", previousRole)
  const { data, error } = await query.single()
  if (error || !data) throw new Error("No se confirmó el cambio de rol.")
}

export async function removeMember(membershipId: string, bandProfileId: string, expectedUserId?: string, previous?: Pick<BandMember, "role" | "status">): Promise<void> {
  const account = await bandMutationAccount(expectedUserId)
  const query = supabase.from("band_members").delete()
    .eq("id", membershipId).eq("band_profile_id", bandProfileId).select("id")
    .setHeader("Authorization", `Bearer ${account.token}`)
  if (previous) query.eq("role", previous.role).eq("status", previous.status)
  const { data, error } = await query.single()
  if (error || !data) throw new Error("No se confirmó la retirada del integrante.")
}

export async function fetchMyPendingInvites(userId: string, accessToken?: string): Promise<PendingInvite[]> {
  const query = supabase
    .from("band_members")
    .select("id, band_profile_id, role, profiles!band_members_band_profile_id_fkey(display_name)")
    .eq("member_user_id", userId)
    .eq("status", "pending")
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data, error } = await query

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

export async function respondToInvite(membershipId: string, decision: "accepted" | "declined", expectedUserId?: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user || (expectedUserId && user.id !== expectedUserId)) throw new Error("No se pudo verificar tu sesión.")
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || sessionData.session?.user.id !== user.id) throw new Error("La cuenta cambió. Vuelve a abrir tus invitaciones.")
  const { data, error } = await supabase.from("band_members").update({ status: decision })
    .eq("id", membershipId)
    .eq("member_user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .single()
    .setHeader("Authorization", `Bearer ${sessionData.session.access_token}`)
  if (error || !data) throw new Error("No se confirmó la respuesta a la invitación.")
}

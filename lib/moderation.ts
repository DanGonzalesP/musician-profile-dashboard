import { supabase } from "@/lib/supabase"
import { traducirErrorDeEscritura } from "@/lib/rate-limit-errors"
import { reportSchema } from "@/lib/report-schema"

// Moderación y cumplimiento legal.
//
// Las páginas de /legal prometían procesos que no existían en el producto:
// reportar contenido, bloquear usuarios, takedown por derechos de autor,
// borrado de cuenta y exportación de datos. Acá viven todos.
// Ver supabase/migrations/0008_moderacion_y_cumplimiento.sql.

export type ReportReason =
  | "derechos_de_autor"
  | "suplantacion"
  | "contenido_sexual"
  | "violencia_o_odio"
  | "spam_o_estafa"
  | "acoso"
  | "otro"

export type ReportTargetType =
  | "perfil"
  | "bloque"
  | "pista"
  | "publicacion"
  | "comentario"
  | "producto"
  | "servicio"

export const REPORT_REASONS: { id: ReportReason; label: string; ayuda: string }[] = [
  {
    id: "derechos_de_autor",
    label: "Uso de mi obra sin permiso",
    ayuda: "Soy el titular de los derechos (o su representante) y este contenido usa mi obra sin autorización.",
  },
  { id: "suplantacion", label: "Suplantación de identidad", ayuda: "Este perfil se hace pasar por otra persona o proyecto." },
  { id: "contenido_sexual", label: "Contenido sexual o inapropiado", ayuda: "Incluye material explícito sin corresponder." },
  { id: "violencia_o_odio", label: "Violencia o discurso de odio", ayuda: "Incita a la violencia o ataca a un grupo." },
  { id: "spam_o_estafa", label: "Spam o estafa", ayuda: "Publicidad engañosa, enlaces fraudulentos o venta falsa." },
  { id: "acoso", label: "Acoso", ayuda: "Hostiga o intimida a una persona concreta." },
  { id: "otro", label: "Otro motivo", ayuda: "Explícalo con el mayor detalle posible." },
]

export type NuevoReporte = {
  reportedProfileId: string
  targetType: ReportTargetType
  targetId?: string
  reason: ReportReason
  details: string
  /** Obligatoria si reason es "derechos_de_autor". */
  swornStatement?: boolean
  /** Para que un titular de derechos sin cuenta reciba respuesta. */
  reporterEmail?: string
}

export async function crearReporte(reporte: NuevoReporte): Promise<void> {
  const details = reporte.details.trim()
  if (details.length < 10 || details.length > 2000) {
    throw new Error("Escribe entre 10 y 2000 caracteres para explicar el reporte.")
  }

  if (reporte.reason === "derechos_de_autor" && !reporte.swornStatement) {
    throw new Error(
      "Para un reclamo por derechos de autor debes declarar, bajo responsabilidad, que eres el titular o su representante."
    )
  }
  const parsed = reportSchema.safeParse(reporte)
  if (!parsed.success) throw new Error("Revisa los datos del reporte y el formato del correo, si lo incluiste.")
  const entrada = parsed.data

  // Se admite sin sesión a propósito: el titular de los derechos de una obra
  // casi nunca es usuario de Vibe.
  const auth = await supabase.auth.getUser().catch(() => null)
  // Sin usuario se conserva la vía anónima, que tiene sus propias comprobaciones
  // y límites. Una consulta de identidad que no responde no cambia de vía.
  if (!auth || (auth.error && auth.error.name !== "AuthSessionMissingError")) {
    throw new Error("No pudimos comprobar la sesión. Reintenta cuando se restablezca la conexión.")
  }
  const user = auth.data.user

  if (!user) {
    const response = await fetch("/api/reportes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entrada),
    }).catch(() => { throw new Error("No pudimos confirmar la recepción del reporte. Conservamos tu texto para que puedas reintentarlo.") })
    if (!response.ok) throw new Error(response.status === 429
      ? "Se alcanzó el límite de reportes. Inténtalo más tarde."
      : "No pudimos recibir el reporte. Revisa los datos e inténtalo más tarde.")
    const result = await response.json().catch(() => null)
    if (response.status !== 201 || result?.accepted !== true) {
      throw new Error("No pudimos confirmar la recepción del reporte. Conservamos tu texto para que puedas reintentarlo.")
    }
    return
  }

  const { data, error } = await Promise.resolve(supabase.from("content_reports").insert({
    reporter_user_id: user?.id ?? null,
    reporter_email: entrada.reporterEmail || null,
    reported_profile_id: entrada.reportedProfileId,
    target_type: entrada.targetType,
    target_id: entrada.targetId ?? null,
    reason: entrada.reason,
    details: entrada.details,
    copyright_sworn_statement: entrada.swornStatement,
  }).select("id").single()).catch(() => ({ data: null, error: { message: "" } }))

  if (error || !data?.id) {
    throw new Error(
      traducirErrorDeEscritura(
        error,
        "reporte",
        "No pudimos confirmar la recepción del reporte. Conservamos tu texto para que puedas reintentarlo."
      )
    )
  }
}

// ─── Bloqueo entre usuarios ───────────────────────────────────────────────

export async function bloquearPerfil(profileId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("Inicia sesión para bloquear a alguien.")

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_user_id: user.id, blocked_profile_id: profileId }, {
      onConflict: "blocker_user_id,blocked_profile_id", ignoreDuplicates: true,
    })

  if (error) throw new Error(traducirErrorDeEscritura(error, "bloqueo", "No se pudo confirmar el bloqueo. Actualiza la lista antes de repetirlo."))
  const confirmed = await supabase.from("user_blocks").select("blocked_profile_id")
    .eq("blocker_user_id", user.id).eq("blocked_profile_id", profileId).maybeSingle()
  if (confirmed.error || !confirmed.data) throw new Error("No se pudo confirmar el bloqueo. Actualiza la lista antes de repetirlo.")
}

export async function desbloquearPerfil(profileId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("Inicia sesión primero.")

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", user.id)
    .eq("blocked_profile_id", profileId)

  if (error) throw new Error("No se pudo confirmar el desbloqueo. Actualiza la lista antes de repetirlo.")
  const remaining = await supabase.from("user_blocks").select("blocked_profile_id")
    .eq("blocker_user_id", user.id).eq("blocked_profile_id", profileId).maybeSingle()
  if (remaining.error || remaining.data) throw new Error("No se pudo confirmar el desbloqueo. Actualiza la lista antes de repetirlo.")
}

export type BlockedProfile = { profileId: string; displayName: string; username: string | null; createdAt: string }
export const BLOCKED_PROFILES_PAGE_SIZE = 20

export async function fetchBlockedProfileDetails(page = 0): Promise<BlockedProfile[]> {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error("Página no válida.")
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("Inicia sesión para consultar tus bloqueos.")
  const start = page * BLOCKED_PROFILES_PAGE_SIZE
  const { data, error } = await supabase.from("user_blocks")
    .select("blocked_profile_id, created_at").eq("blocker_user_id", user.id)
    .order("created_at", { ascending: false }).order("blocked_profile_id", { ascending: false })
    .range(start, start + BLOCKED_PROFILES_PAGE_SIZE - 1)
  if (error) throw new Error("No se pudo cargar la lista de bloqueos.")
  if (!data?.length) return []
  const profiles = await supabase.from("profiles").select("id, display_name, username")
    .in("id", data.map(row => row.blocked_profile_id))
  if (profiles.error) throw new Error("No se pudieron cargar los perfiles de la lista.")
  return data.map(row => {
    const profile = profiles.data?.find(candidate => candidate.id === row.blocked_profile_id)
    return { profileId: row.blocked_profile_id, createdAt: row.created_at,
      displayName: profile?.display_name || "Perfil no disponible", username: profile?.username ?? null }
  })
}

/** Ids de perfil que el usuario actual bloqueó, para filtrar el feed. */
export async function fetchPerfilesBloqueados(): Promise<string[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No se pudo comprobar la sesión para cargar bloqueos.")
  const ids: string[] = []
  let cursor: string | null = null
  for (;;) {
    let query = supabase.from("user_blocks").select("blocked_profile_id")
      .eq("blocker_user_id", user.id).order("blocked_profile_id").limit(500)
    if (cursor) query = query.gt("blocked_profile_id", cursor)
    const { data, error } = await query
    if (error) throw new Error("No se pudo cargar la lista de bloqueos.")
    const batch = (data ?? []).map(row => row.blocked_profile_id as string)
    ids.push(...batch)
    if (batch.length < 500) return ids
    cursor = batch[batch.length - 1]
  }
}

// ─── Derechos del titular de los datos (Ley 29733 / GDPR) ─────────────────

/**
 * Copia de los datos incluidos por la RPC de exportación. El alcance se
 * documenta en la interfaz; no equivale todavía a todos los datos de la cuenta.
 */
export const EXPORT_DATA_CATEGORIES = [
  ["perfiles", "Perfiles"], ["datos_privados", "Datos privados"],
  ["bloques", "Contenido del perfil"], ["archivos", "Inventario de archivos"],
  ["productos", "Productos"], ["servicios", "Servicios"], ["musica", "Publicaciones musicales"],
  ["comentarios_musica", "Comentarios de música"], ["comentarios_publicaciones", "Comentarios de publicaciones"],
  ["bloqueos", "Perfiles bloqueados"], ["membresias", "Membresías"],
  ["creditos_solicitados", "Créditos solicitados"], ["licencias", "Licencias"], ["certificados", "Certificados"],
  ["reportes_enviados", "Reportes enviados con sesión"],
  ["decisiones_perfiles_propios", "Decisiones sobre tus perfiles"],
  ["solicitudes_revision", "Solicitudes de revisión y respuestas"],
  ["cuenta", "Datos básicos de la cuenta"], ["lecturas_moderacion", "Lecturas de moderación"],
  ["preguntas_enviadas", "Preguntas enviadas"], ["preguntas_recibidas", "Preguntas recibidas"],
  ["solicitudes_creacion_servicios", "Comprobantes de creación de servicios"],
  ["creditos_recibidos", "Solicitudes de crédito recibidas y decisiones"],
] as const

export async function exportarMisDatos(expectedOwnerUserId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const { data: auth, error: authError } = await supabase.auth.getSession()
  if (authError || !auth.session || auth.session.user.id !== expectedOwnerUserId) {
    throw new Error("La sesión cambió. Recarga la configuración antes de descargar datos.")
  }
  if (signal?.aborted) throw new Error("La preparación de la copia se canceló.")
  const request = supabase.rpc("exportar_mis_datos")
    .setHeader("Authorization", `Bearer ${auth.session.access_token}`)
  if (signal) request.abortSignal(signal)
  const { data, error } = await request
  if (error || !data || typeof data !== "object" || Array.isArray(data) ||
    !["perfiles", "datos_privados", "bloques", "archivos"].every(key => Array.isArray(data[key]))) {
    throw new Error("No se pudo preparar la copia de tus datos. Vuelve a intentarlo más tarde.")
  }
  const version = data.version_formato ?? 1
  const expected = version === 6 ? EXPORT_DATA_CATEGORIES : version === 5 ? EXPORT_DATA_CATEGORIES.slice(0, 22) : version === 4 ? EXPORT_DATA_CATEGORIES.slice(0, 21) : version === 3 ? EXPORT_DATA_CATEGORIES.slice(0, 17) : version === 2 ? EXPORT_DATA_CATEGORIES.slice(0, 14) : EXPORT_DATA_CATEGORIES.slice(0, 4)
  if (![1, 2, 3, 4, 5, 6].includes(version) || expected.some(([key]) => !Array.isArray(data[key]))) {
    throw new Error("La copia recibida no contiene todas las categorías esperadas. Vuelve a intentarlo más tarde.")
  }
  // Constancias de aceptación legal (0071), con la misma sesión. Sólo se tolera
  // una base que todavía no tiene la función (despliegue en transición), y se
  // indica en la copia; cualquier otro fallo invalida la exportación completa.
  const legal = supabase.rpc("read_my_legal_acceptances").setHeader("Authorization", `Bearer ${auth.session.access_token}`)
  if (signal) legal.abortSignal(signal)
  const { data: constancias, error: legalError } = await legal
  if (legalError?.code === "PGRST202") {
    return { ...data, constancias_legales: null, constancias_legales_estado: "no_disponible_en_esta_version" }
  }
  if (legalError || !Array.isArray(constancias)) {
    throw new Error("No se pudo preparar la copia de tus datos. Vuelve a intentarlo más tarde.")
  }
  return { ...data, constancias_legales: constancias }
}

/**
 * Elimina la cuenta y todo lo que cuelga de ella. Irreversible.
 *
 * Derecho de supresión (Ley 29733 art. 20; GDPR art. 17). Es especialmente
 * relevante en Vibe porque se almacenan DNIs en profile_private.
 *
 * Los archivos de R2 se borran aparte, desde /api/eliminar-cuenta: SQL no
 * puede hablar con el almacenamiento de objetos.
 */
export async function eliminarMiCuenta(): Promise<void> {
  const { error } = await supabase.rpc("eliminar_mi_cuenta")
  if (error) throw new Error(error.message)
  await supabase.auth.signOut()
}

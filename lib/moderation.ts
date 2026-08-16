import { supabase } from "@/lib/supabase"
import { traducirErrorDeEscritura } from "@/lib/rate-limit-errors"

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
  if (details.length < 10) {
    throw new Error("Cuéntanos un poco más: se necesitan al menos 10 caracteres.")
  }
  if (reporte.reason === "derechos_de_autor" && !reporte.swornStatement) {
    throw new Error(
      "Para un reclamo por derechos de autor debes declarar, bajo responsabilidad, que eres el titular o su representante."
    )
  }

  // Se admite sin sesión a propósito: el titular de los derechos de una obra
  // casi nunca es usuario de Vibe.
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from("content_reports").insert({
    reporter_user_id: user?.id ?? null,
    reporter_email: reporte.reporterEmail?.trim() || null,
    reported_profile_id: reporte.reportedProfileId,
    target_type: reporte.targetType,
    target_id: reporte.targetId ?? null,
    reason: reporte.reason,
    details,
    copyright_sworn_statement: Boolean(reporte.swornStatement),
  })

  if (error) {
    throw new Error(
      traducirErrorDeEscritura(
        error,
        "reporte",
        error.message.includes("content_reports")
          ? "Los reportes aún no están activados: falta correr supabase/migrations/0008_moderacion_y_cumplimiento.sql."
          : error.message
      )
    )
  }
}

// ─── Bloqueo entre usuarios ───────────────────────────────────────────────

export async function bloquearPerfil(profileId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inicia sesión para bloquear a alguien.")

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_user_id: user.id, blocked_profile_id: profileId })

  if (error) throw new Error(traducirErrorDeEscritura(error, "bloqueo", error.message))
}

export async function desbloquearPerfil(profileId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inicia sesión primero.")

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", user.id)
    .eq("blocked_profile_id", profileId)

  if (error) throw new Error(error.message)
}

/** Ids de perfil que el usuario actual bloqueó, para filtrar el feed. */
export async function fetchPerfilesBloqueados(): Promise<string[]> {
  const { data, error } = await supabase.from("user_blocks").select("blocked_profile_id")
  if (error) return []
  return (data ?? []).map((r) => r.blocked_profile_id as string)
}

// ─── Derechos del titular de los datos (Ley 29733 / GDPR) ─────────────────

/**
 * Copia completa de los datos de la cuenta, en JSON. Derecho de acceso y
 * portabilidad (Ley 29733 art. 19; GDPR art. 15 y 20).
 */
export async function exportarMisDatos(): Promise<unknown> {
  const { data, error } = await supabase.rpc("exportar_mis_datos")
  if (error) throw new Error(error.message)
  return data
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

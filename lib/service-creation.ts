import { supabase } from "@/lib/supabase"

export class ServiceCreationRejectedError extends Error {
  constructor(readonly reason: "conflict" | "permission" | "invalid" | "unavailable") {
    const messages = {
      conflict: "Esta solicitud ya no puede recuperarse: sus datos cambiaron o el servicio fue retirado. Cierra el formulario y revisa la lista antes de crear otro.",
      permission: "Tu cuenta ya no tiene permiso para crear este servicio. Cierra el formulario y revisa el acceso al perfil.",
      invalid: "La solicitud contiene datos que no se pueden guardar. Cierra el formulario y corrige los datos en un nuevo intento.",
      unavailable: "La creación de servicios todavía no está disponible. Conserva tus datos y vuelve a intentarlo cuando el servicio esté habilitado.",
    }
    super(messages[reason])
    this.name = "ServiceCreationRejectedError"
  }
}

/** Requires migration 0052. Do not fall back to INSERT on uncertain RPC failure. */
export function createServiceCreationAttempt(
  profileId: string,
  requestId: string,
  payload: Record<string, unknown>,
  ownerUserId: string,
) {
  // Capture the body once: a new list position or edits after a lost response
  // must never silently turn an existing request into a different operation.
  const body = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  let inFlight: Promise<string> | null = null

  async function execute(isCurrent: () => boolean): Promise<string> {
    if (!isCurrent()) throw new Error("La cuenta cambió. Vuelve a abrir el gestor.")
    const { data: auth, error: authError } = await supabase.auth.getSession()
    if (!isCurrent() || authError || !auth.session || auth.session.user.id !== ownerUserId) {
      throw new Error("Vuelve a iniciar sesión con la cuenta original.")
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const { data, error } = await supabase.rpc("create_service_once", {
        p_profile_id: profileId,
        p_request_id: requestId,
        p_service: body,
      }).setHeader("Authorization", `Bearer ${auth.session.access_token}`).abortSignal(controller.signal)
      if (!isCurrent()) throw new Error("La cuenta cambió. Revisa el servicio al volver a entrar.")
      // Only classify explicit server rejections. A timeout, missing response or
      // unknown error still has an uncertain outcome and retains the same request.
      if (error?.code === "PT409") throw new ServiceCreationRejectedError("conflict")
      if (error?.code === "42501") throw new ServiceCreationRejectedError("permission")
      if (error?.code?.startsWith("22")) throw new ServiceCreationRejectedError("invalid")
      if (error?.code === "PGRST202") throw new ServiceCreationRejectedError("unavailable")
      if (error || !data || typeof data.id !== "string" || !/^[1-9]\d*$/.test(data.id)) {
        throw new Error("No pudimos confirmar la creación. Conserva este formulario para recuperar la misma solicitud.")
      }
      return data.id
    } finally {
      clearTimeout(timer)
    }
  }

  return (isCurrent: () => boolean): Promise<string> => {
    if (inFlight) return inFlight
    inFlight = execute(isCurrent).finally(() => { inFlight = null })
    return inFlight
  }
}

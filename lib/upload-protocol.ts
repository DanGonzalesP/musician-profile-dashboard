import { supabase } from "@/lib/supabase"
import { validateUploadRequest } from "@/lib/upload-validation"
import { MEDIA_PATH } from "@/lib/media-url"
import { UploadFeedbackError, uploadResponseError } from "@/lib/upload-feedback"
import { recoverUploadAttempt, recoveredBytesMatch } from "@/lib/upload-recovery"

class UploadSessionError extends UploadFeedbackError {}

/** Incluye la lectura JSON en el plazo; un servidor que no termina el cuerpo
 * tampoco deja bloqueado el formulario. PUT no necesita cuerpo de respuesta. */
async function fetchUploadStep(url: string, init: RequestInit, api = false, cancellation?: AbortSignal): Promise<Response> {
  cancellation?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(cancellation?.reason)
  cancellation?.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(() => controller.abort(), api ? 30_000 : 300_000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!api) {
      void response.body?.cancel().catch(() => {})
      return response
    }
    const body = await response.text()
    return new Response(body || null, { status: response.status, statusText: response.statusText, headers: response.headers })
  } finally {
    clearTimeout(timer)
    cancellation?.removeEventListener("abort", cancel)
  }
}

/** Sólo para operaciones idempotentes: una respuesta perdida puede haber
 * confirmado la escritura. Se conserva la misma reserva, cuerpo y condición. */
async function retryUploadStep(operation: () => Promise<Response>, cancellation?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    cancellation?.throwIfAborted()
    try {
      const response = await operation()
      cancellation?.throwIfAborted()
      // No reintentar rechazos de permisos, cuota, conflicto ni rate limit.
      if (response.status < 500 || attempt === 1) return response
    } catch (error) {
      cancellation?.throwIfAborted()
      if (error instanceof UploadSessionError) throw error
      if (attempt === 1) throw new UploadFeedbackError("No se pudo conectar para completar la subida. Inténtalo de nuevo.")
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

/** Transporte compartido: ninguna URL se guarda antes del HEAD y finalización. */
export async function uploadVerifiedFile(file: File, folder: "images" | "audio" | "video", profileId?: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new UploadSessionError("Inicia sesión para subir archivos.")
  return createVerifiedUploadAttempt(file, folder, data.session.user.id, profileId)()
}

/** Intento en memoria y referencia temporal local: nunca persiste bytes, tokens ni URLs firmadas.
 * El llamador puede repetir run después de un fallo; llamadas simultáneas comparten trabajo. */
export function createVerifiedUploadAttempt(file: File, folder: "images" | "audio" | "video", ownerUserId: string, profileId?: string): (cancellation?: AbortSignal) => Promise<string> {
  // Generarlo fuera del reintento evita reservar otra key si se perdió la
  // respuesta de una reserva que Postgres sí llegó a confirmar.
  const extension = file.name.split(".").pop()?.toLowerCase()
  const validation = validateUploadRequest({ folder, extension, contentType: file.type, bytes: file.size })
  if (!validation.ok) throw new UploadFeedbackError(validation.error, true)
  const { safeExt } = validation
  let uploadId: string = crypto.randomUUID()
  let expectedKey = `${folder}/${ownerUserId}/${uploadId}.${safeExt}`
  let recoveryReady = false
  let verifyRecoveryBytes = false
  let forgetRecovery = () => {}
  let uploadedKey: string | null = null
  let reservedKey: string | null = null
  let inFlight: Promise<string> | null = null

  async function sessionForAttempt(cancellation?: AbortSignal) {
    cancellation?.throwIfAborted()
    const { data, error } = await supabase.auth.getSession()
    cancellation?.throwIfAborted()
    if (error || !data.session || data.session.user.id !== ownerUserId) {
      throw new UploadSessionError("La sesión cambió. Vuelve a tu cuenta o selecciona el archivo de nuevo.")
    }
    return data.session
  }
  async function authedFetch(url: string, init: RequestInit, cancellation?: AbortSignal) {
    const session = await sessionForAttempt(cancellation)
    return fetchUploadStep(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.access_token}` } }, true, cancellation)
  }
  async function completeUpload(key: string, allowMissing = false, cancellation?: AbortSignal): Promise<string | null> {
    const finalized = await retryUploadStep(() => authedFetch("/api/finalize-upload", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }),
    }, cancellation), cancellation)
    const body = await finalized.json().catch(() => ({}))
    // Sólo una respuesta explícita permite volver a pedir la MISMA reserva.
    // Red/5xx/429/permisos nunca se convierten en "el archivo no llegó".
    if (allowMissing && (finalized.status === 404 || finalized.status === 409)) return null
    if (!finalized.ok) throw uploadResponseError(finalized, "finalize", body.code)
    if (body.publicUrl !== `${MEDIA_PATH}${expectedKey}`) throw new UploadFeedbackError("No se pudo verificar la subida. Inténtalo de nuevo.")
    if (verifyRecoveryBytes) {
      const session = await sessionForAttempt(cancellation)
      const deadline = AbortSignal.timeout(300_000)
      const signal = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline
      const response = await fetch(body.publicUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", redirect: "error", signal,
      })
      if (!await recoveredBytesMatch(response, file, signal)) {
        throw new UploadFeedbackError("El archivo recuperado no coincide con el seleccionado. Selecciónalo de nuevo para iniciar una subida nueva.", true)
      }
      verifyRecoveryBytes = false
    }
    await sessionForAttempt(cancellation)
    uploadedKey = key
    forgetRecovery()
    return body.publicUrl
  }
  async function run(cancellation?: AbortSignal): Promise<string> {
    await sessionForAttempt(cancellation)
    if (!recoveryReady) {
      const recovery = await recoverUploadAttempt(file, [ownerUserId, profileId ?? "", folder, safeExt], uploadId, cancellation)
      uploadId = recovery.uploadId
      expectedKey = `${folder}/${ownerUserId}/${uploadId}.${safeExt}`
      forgetRecovery = recovery.forget
      if (recovery.recovered) { reservedKey = expectedKey; verifyRecoveryBytes = true }
      recoveryReady = true
      await sessionForAttempt(cancellation)
    }
    if (!uploadedKey && reservedKey) {
      const recovered = await completeUpload(reservedKey, true, cancellation)
      if (recovered) return recovered
    }
    if (!uploadedKey) {
      const reserved = await retryUploadStep(() => authedFetch("/api/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, extension, contentType: file.type,
          bytes: file.size, uploadId, ...(profileId ? { profileId } : {}) }),
      }, cancellation), cancellation)
      if (!reserved.ok) {
        const body = await reserved.json().catch(() => ({}))
        throw uploadResponseError(reserved, "reserve", body.code)
      }
      const { key, uploadUrl, headers } = await reserved.json()
      if (key !== expectedKey || typeof uploadUrl !== "string" ||
        headers?.["If-None-Match"] !== "*" || headers?.["Content-Type"] !== file.type) {
        throw new UploadFeedbackError("No se pudo comprobar la reserva de subida.")
      }
      reservedKey = key
      let uploaded: Response
      try {
        uploaded = await retryUploadStep(async () => {
          await sessionForAttempt(cancellation)
          return fetchUploadStep(uploadUrl, { method: "PUT", body: file,
            headers: { "Content-Type": file.type, "If-None-Match": "*" } }, false, cancellation)
        }, cancellation)
      } catch (error) {
        // Cancelar no prueba que el servidor no recibió bytes. Conservar la
        // reserva para que el próximo intento consulte su estado, sin reenviar.
        cancellation?.throwIfAborted()
        if (error instanceof UploadSessionError) throw error
        const recovered = await completeUpload(key, true, cancellation)
        if (recovered) return recovered
        throw new UploadFeedbackError("No pudimos confirmar la transferencia. Conserva este editor abierto para reintentar con el mismo archivo.")
      }
      // 412 puede indicar un PUT ya completado. HEAD + RPC aún deben verificarlo.
      if (!uploaded.ok && uploaded.status !== 412) {
        const recovered = await completeUpload(key, true, cancellation)
        if (recovered) return recovered
        throw new UploadFeedbackError("No se pudo subir el archivo al almacenamiento. Conserva este editor abierto para reintentar.")
      }
      uploadedKey = key
    }
    const publicUrl = await completeUpload(expectedKey, false, cancellation)
    if (!publicUrl) throw new UploadFeedbackError("No se pudo verificar la subida. Conserva este editor abierto para reintentar.")
    return publicUrl
  }
  return (cancellation?: AbortSignal) => {
    if (cancellation?.aborted) return Promise.reject(cancellation.reason)
    // El primer llamador controla el trabajo compartido. Los duplicados del
    // editor usan la misma señal de publicación y nunca crean otro PUT.
    if (!inFlight) inFlight = run(cancellation).catch(error => {
      if (error instanceof UploadFeedbackError && error.requiresNewFile) forgetRecovery()
      throw error
    }).finally(() => { inFlight = null })
    return inFlight
  }
}

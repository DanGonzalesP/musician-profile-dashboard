// Sólo mensajes definidos por la aplicación; nunca texto arbitrario del servidor.
export class UploadFeedbackError extends Error {
  constructor(message: string, readonly requiresNewFile = false) {
    super(message)
  }
}

export function uploadRequiresNewFile(error: unknown): boolean {
  return error instanceof UploadFeedbackError && error.requiresNewFile
}

export function uploadFailureMessage(error: unknown, fallback: string): string {
  return error instanceof UploadFeedbackError ? error.message : fallback
}

export function uploadResponseError(response: Response, stage: "reserve" | "finalize", code?: unknown): UploadFeedbackError {
  if (response.status === 401) return new UploadFeedbackError("Tu sesión venció. Vuelve a iniciar sesión con la cuenta original antes de reintentar.")
  if (response.status === 403) return new UploadFeedbackError("Tu cuenta no tiene permiso para completar esta subida. Comprueba el perfil y tus permisos.")
  if (response.status === 503) return new UploadFeedbackError("El servicio de archivos no está disponible. Conservamos la imagen seleccionada mientras este formulario siga abierto. Puedes reintentar cuando se restablezca o descartarla para continuar sin esa imagen.")
  if (response.status === 413 && stage === "reserve") return new UploadFeedbackError("No hay espacio confirmado para este archivo. Consulta Almacenamiento en Configuración. La retirada de archivos y las reservas pendientes pueden tardar en liberar espacio.")
  if (response.status === 429) {
    const raw = response.headers.get("Retry-After")
    const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : 0
    return new UploadFeedbackError(Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400
      ? `Se alcanzó el límite temporal de subidas. Espera al menos ${seconds} segundos antes de reintentar. Conserva este formulario abierto.`
      : "Se alcanzó el límite temporal de subidas. Espera un momento antes de reintentar y conserva este formulario abierto.")
  }
  if (response.status === 409 && code === "upload_expired") return new UploadFeedbackError("La reserva de subida venció. Selecciona el archivo de nuevo para iniciar otra subida; repetir este intento no renueva la reserva.", true)
  if (response.status === 409 || response.status === 404) return new UploadFeedbackError(stage === "reserve"
    ? "Esta reserva ya no está disponible. Comprueba tu cuenta y selecciona el archivo de nuevo."
    : "El archivo todavía no pudo verificarse. Conserva el formulario abierto y reintenta completar la subida.", stage === "reserve")
  if (response.status === 400) return new UploadFeedbackError("No se pudo aceptar el archivo. Revisa su formato y tamaño y vuelve a seleccionarlo.", true)
  return new UploadFeedbackError("No se pudo confirmar la subida. Conservamos el archivo mientras este formulario siga abierto; vuelve a intentarlo cuando se restablezca el servicio.")
}

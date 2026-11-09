// ¿La respuesta de Auth prueba que la sesión guardada ya no sirve?
//
// Sólo cuenta una negativa explícita del servidor (401/403 o los códigos de
// sesión/usuario inexistente). Un fallo de red, un 5xx o un 429 NO invalidan la
// sesión: cerrar sesión por estar sin conexión sería peor que esperar.
const INVALID_CODES = new Set(["user_not_found", "session_not_found", "bad_jwt", "session_expired", "refresh_token_not_found"])

export type AuthFailure = { status?: number; code?: string; name?: string } | null | undefined

export function sessionIsDefinitelyInvalid(error: AuthFailure): boolean {
  if (!error) return false
  if (error.code && INVALID_CODES.has(error.code)) return true
  return error.status === 401 || error.status === 403
}

// Allowlist de administradores para las rutas de mantenimiento.
//
// Vibe todavía no tiene un sistema de roles en la base (eso llega con el
// panel de administración de la Fase 3). Hasta entonces, las operaciones
// destructivas de infraestructura — borrado masivo en R2, limpiezas — se
// restringen a una lista explícita de user ids de Supabase declarada en la
// variable de entorno ADMIN_USER_IDS, separados por coma:
//
//   ADMIN_USER_IDS=8f3a...-uuid-1,2b91...-uuid-2
//
// Sin esa variable NADIE es admin. Es a propósito: prefiero que una ruta de
// mantenimiento quede inutilizable a que quede abierta por un despiste de
// configuración.

export function isAdminUser(userId: string): boolean {
  const raw = process.env.ADMIN_USER_IDS
  if (!raw) return false

  const allowed = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  return allowed.includes(userId)
}

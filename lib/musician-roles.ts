// Los 7 roles profesionales de vibra. Reemplazan a las 5 categorías
// antiguas (autores/productores/directores/interpretes/tecnicos): ahora un
// músico puede tener VARIOS roles a la vez (profiles.musician_roles text[])
// y el feed se filtra por cualquiera de ellos desde la barra lateral.
// Los ids coinciden con el check de supabase/setup_vibra.sql.

export type MusicianRole =
  | "autores"
  | "compositores"
  | "arreglistas"
  | "directores"
  | "productores"
  | "mezclas"
  | "musicos"

export const MUSICIAN_ROLES: {
  id: MusicianRole
  label: string
  description: string
}[] = [
  { id: "autores", label: "Autores", description: "Letristas y creadores de la palabra" },
  { id: "compositores", label: "Compositores", description: "Creadores de la música y la melodía" },
  { id: "arreglistas", label: "Arreglistas", description: "Dan forma y color a cada versión" },
  { id: "directores", label: "Directores", description: "Directores de orquesta, coro y ensamble" },
  { id: "productores", label: "Productores", description: "Producción musical, beatmakers y topliners" },
  { id: "mezclas", label: "Mezclas", description: "Ingenieros de grabación, mezcla y mastering" },
  { id: "musicos", label: "Músicos", description: "Intérpretes, vocalistas y músicos de sesión" },
]

// Filtro extra del feed que no es un rol de persona: las páginas de grupos
// musicales (profiles.profile_type = 'band').
export const GROUPS_FILTER_ID = "grupos" as const

export type FeedFilterId = MusicianRole | typeof GROUPS_FILTER_ID

export function isMusicianRole(value: unknown): value is MusicianRole {
  return typeof value === "string" && MUSICIAN_ROLES.some((r) => r.id === value)
}

/**
 * Normaliza lo que venga de la DB (text[] nuevo, o el string viejo de
 * musician_category si la migración aún no corrió) a una lista de roles
 * válidos, sin duplicados y en el orden canónico de MUSICIAN_ROLES.
 */
export function parseMusicianRoles(value: unknown): MusicianRole[] {
  const raw: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  const mapped = raw.map((v) => LEGACY_CATEGORY_MAP[String(v)] ?? v).filter(isMusicianRole)
  return MUSICIAN_ROLES.map((r) => r.id).filter((id) => mapped.includes(id))
}

// Equivalencia de las 5 categorías viejas → roles nuevos (para datos ya
// guardados con musician_category antes de correr la migración).
const LEGACY_CATEGORY_MAP: Record<string, MusicianRole> = {
  autores: "autores",
  productores: "productores",
  directores: "directores",
  interpretes: "musicos",
  tecnicos: "mezclas",
}

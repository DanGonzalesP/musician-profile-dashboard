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
  { id: "autores", label: "Autor", description: "Letrista y creador de la palabra" },
  { id: "compositores", label: "Compositor", description: "Creador de la música y la melodía" },
  { id: "arreglistas", label: "Arreglista", description: "Da forma y color a cada versión" },
  { id: "directores", label: "Director", description: "Director de orquesta, coro o ensamble" },
  { id: "productores", label: "Productor", description: "Producción musical, beatmaker o topliner" },
  { id: "mezclas", label: "Mezcla", description: "Ingeniero de grabación, mezcla o mastering" },
  { id: "musicos", label: "Músico", description: "Intérprete, vocalista o músico de sesión" },
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

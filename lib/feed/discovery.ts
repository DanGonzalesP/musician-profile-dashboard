import { supabase } from "@/lib/supabase"
import { parseMusicianRoles, type MusicianRole } from "@/lib/musician-roles"

// Datos para el modo "descubrimiento" del feed (secciones Servicios y
// Productos + el filtro Tienda): perfiles agrupados que ofrecen servicios o
// venden productos. No es el feed vertical de canciones/publicaciones — son
// tarjetas de perfil que enlazan a la página /[username]/tienda.
//
// Igual que fetchAllPublicFeed, se degrada si faltan columnas nuevas: se
// intenta el select más completo y se cae a uno mínimo, para no romper la
// pantalla por una migración pendiente.

export type DiscoveryProfile = {
  profileId: string
  displayName: string
  slug: string
  roles: MusicianRole[]
  isGroup: boolean
  count: number
  categories: string[]
}

type JoinRow = {
  category?: unknown
  is_active?: unknown
  profiles: {
    display_name?: string | null
    musician_roles?: unknown
    musician_category?: string | null
    profile_type?: string | null
  } | null
}

function slugFor(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, "-")
}

// Agrupa filas producto/servicio (con su perfil embebido) por perfil, contando
// cuántas tiene cada uno y juntando sus categorías. Descarta las inactivas.
function aggregate(rows: JoinRow[], keyName: string): DiscoveryProfile[] {
  const byName = new Map<string, DiscoveryProfile>()

  for (const row of rows) {
    if (row.is_active === false) continue
    const profile = row.profiles
    const displayName = (profile?.display_name ?? "").trim()
    if (!displayName) continue

    const existing = byName.get(displayName)
    const category = typeof row.category === "string" && row.category ? row.category : ""

    if (existing) {
      existing.count += 1
      if (category && !existing.categories.includes(category)) existing.categories.push(category)
    } else {
      byName.set(displayName, {
        // El feed enlaza por slug (display_name), no por id — se mantiene un
        // id sintético estable por si hace falta como key de React.
        profileId: `${keyName}-${slugFor(displayName)}`,
        displayName,
        slug: slugFor(displayName),
        roles: parseMusicianRoles(profile?.musician_roles ?? profile?.musician_category),
        isGroup: profile?.profile_type === "band",
        count: 1,
        categories: category ? [category] : [],
      })
    }
  }

  return [...byName.values()].sort((a, b) => b.count - a.count)
}

async function fetchJoined(table: "products" | "services"): Promise<JoinRow[]> {
  const selects = [
    `category, is_active, profiles ( display_name, musician_roles, profile_type )`,
    `category, is_active, profiles ( display_name, musician_category, profile_type )`,
    `is_active, profiles ( display_name, profile_type )`,
    `profiles ( display_name )`,
  ]

  for (const select of selects) {
    const { data, error } = await supabase.from(table).select(select).limit(500)
    if (!error) return (data as unknown as JoinRow[]) ?? []
  }
  return []
}

export async function fetchProductSellers(): Promise<DiscoveryProfile[]> {
  return aggregate(await fetchJoined("products"), "prod")
}

export async function fetchServiceProviders(): Promise<DiscoveryProfile[]> {
  return aggregate(await fetchJoined("services"), "serv")
}

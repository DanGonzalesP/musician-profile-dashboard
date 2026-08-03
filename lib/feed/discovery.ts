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
    username?: string | null
    display_name?: string | null
    musician_roles?: unknown
    musician_category?: string | null
    profile_type?: string | null
  } | null
}

// Agrupa filas producto/servicio (con su perfil embebido) por perfil, contando
// cuántas tiene cada uno y juntando sus categorías. Descarta las inactivas.
function aggregate(rows: JoinRow[], keyName: string): DiscoveryProfile[] {
  const byName = new Map<string, DiscoveryProfile>()

  for (const row of rows) {
    if (row.is_active === false) continue
    const profile = row.profiles
    const username = (profile?.username ?? "").trim()
    const displayName = (profile?.display_name ?? "").trim()
    // Se agrupa por username, no por nombre visible: dos artistas pueden
    // llamarse igual y antes se fusionaban en una sola tarjeta.
    if (!username) continue

    const existing = byName.get(username)
    const category = typeof row.category === "string" && row.category ? row.category : ""

    if (existing) {
      existing.count += 1
      if (category && !existing.categories.includes(category)) existing.categories.push(category)
    } else {
      byName.set(username, {
        // El feed enlaza por username real — se mantiene un id sintético
        // estable por si hace falta como key de React.
        profileId: `${keyName}-${username}`,
        displayName: displayName || username,
        slug: username,
        roles: parseMusicianRoles(profile?.musician_roles ?? profile?.musician_category),
        isGroup: profile?.profile_type === "band",
        count: 1,
        categories: category ? [category] : [],
      })
    }
  }

  return [...byName.values()].sort((a, b) => b.count - a.count)
}

// Techo de filas que se traen para armar el descubrimiento.
//
// DEUDA CONOCIDA: la agregación por perfil se hace en el cliente, así que
// esto es una muestra de las N más recientes, no el conjunto completo. Con
// pocos miles de productos alcanza; pasado ese punto hay que mover el
// group by a una vista materializada o un RPC en Postgres (ver PLAN.md §1.4).
// Lo que sí queda arreglado acá es que la muestra sea DETERMINISTA.
const DISCOVERY_ROW_LIMIT = 500

async function fetchJoined(table: "products" | "services"): Promise<JoinRow[]> {
  const selects = [
    `category, is_active, profiles ( username, display_name, musician_roles, profile_type )`,
    `category, is_active, profiles ( username, display_name, musician_category, profile_type )`,
    `is_active, profiles ( username, display_name, profile_type )`,
    `profiles ( username, display_name )`,
  ]

  for (const select of selects) {
    // .order() explícito: sin ORDER BY, Postgres no garantiza ningún orden,
    // así que un .limit() pelado devolvía 500 filas ARBITRARIAS — y con la
    // tabla creciendo, cuáles cambiaba entre cargas.
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("created_at", { ascending: false })
      .limit(DISCOVERY_ROW_LIMIT)
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

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

export type JoinRow = {
  category?: unknown
  is_active?: unknown
  profiles: {
    username?: string | null
    display_name?: string | null
    musician_roles?: unknown
    musician_category?: string | null
    profile_type?: string | null
    is_suspended?: boolean | null
  } | null
}

// Agrupa filas producto/servicio (con su perfil embebido) por perfil, contando
// cuántas tiene cada uno y juntando sus categorías. Descarta las inactivas.
export function aggregate(rows: JoinRow[], keyName: string): DiscoveryProfile[] {
  const byName = new Map<string, DiscoveryProfile>()

  for (const row of rows) {
    if (row.is_active === false) continue
    const profile = row.profiles
    // Segunda capa de la suspensión (P-34). La primera vive en RLS: la política
    // de profile_blocks oculta el contenido de un perfil suspendido. Pero el
    // descubrimiento sale de products/services, que esa política no cubre, así
    // que un perfil suspendido con productos podría reaparecer en la tienda si
    // sólo confiáramos en la base. Aquí se filtra también en el código —defensa
    // en profundidad, sin cambio visible para los perfiles no suspendidos.
    if (profile?.is_suspended === true) continue
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

// ─── Camino preferido: la agregación la hace Postgres (P-16) ───────────────
//
// `descubrimiento_perfiles` (migración 0012) devuelve UNA fila por perfil, con
// su conteo real y sus categorías, sin traer una sola fila de producto al
// proceso. Reemplaza la agregación sobre una muestra de 500 filas, que con
// volumen simplemente mentía: un artista cuyos productos quedaban fuera de esa
// muestra desaparecía del carrusel.
//
// Si la función todavía no existe (migración sin aplicar), se cae al camino
// anterior sin que el usuario note nada. Es la regla de despliegue del plan
// (§6.4): el código nuevo tolera el esquema viejo durante el intervalo.

/** Filas tal como las devuelve el RPC de 0012. */
export type FilaDescubrimiento = {
  username?: string | null
  display_name?: string | null
  profile_type?: string | null
  musician_roles?: unknown
  categorias?: unknown
  total?: number | string | null
}

export function mapearFilasRpc(filas: FilaDescubrimiento[], keyName: string): DiscoveryProfile[] {
  const salida: DiscoveryProfile[] = []

  for (const fila of filas) {
    const username = (fila.username ?? "").trim()
    if (!username) continue

    const categorias = Array.isArray(fila.categorias)
      ? fila.categorias.filter((c): c is string => typeof c === "string" && c.length > 0)
      : []

    salida.push({
      profileId: `${keyName}-${username}`,
      displayName: (fila.display_name ?? "").trim() || username,
      slug: username,
      roles: parseMusicianRoles(fila.musician_roles),
      isGroup: fila.profile_type === "band",
      count: Number(fila.total ?? 0) || 0,
      categories: categorias,
    })
  }

  // El RPC ya ordena por conteo; se reordena igual para no depender de eso y
  // para que las dos rutas (RPC y respaldo) devuelvan exactamente lo mismo.
  return salida.sort((a, b) => b.count - a.count)
}

/** Cuántos perfiles se muestran en el carrusel de descubrimiento. */
const DISCOVERY_PROFILE_LIMIT = 60

async function fetchDesdeRpc(
  tipo: "productos" | "servicios",
  keyName: string
): Promise<DiscoveryProfile[] | null> {
  const { data, error } = await supabase.rpc("descubrimiento_perfiles", {
    p_tipo: tipo,
    p_limite: DISCOVERY_PROFILE_LIMIT,
  })
  // Cualquier error —función inexistente, permiso, tipo— cae al respaldo. No se
  // rompe una pantalla pública por una migración que todavía no corrió.
  if (error || !Array.isArray(data)) return null
  return mapearFilasRpc(data as FilaDescubrimiento[], keyName)
}

// Techo de filas del camino de respaldo (sin la migración 0012).
//
// DEUDA CONOCIDA, y por eso existe el RPC de arriba: acá la agregación se hace
// en JavaScript sobre una muestra de las N más recientes, no sobre el conjunto
// completo. Con pocos miles de productos alcanza. Lo que sí está arreglado es
// que la muestra sea DETERMINISTA.
const DISCOVERY_ROW_LIMIT = 500

async function fetchJoined(table: "products" | "services"): Promise<JoinRow[]> {
  const selects = [
    `category, is_active, profiles ( username, display_name, musician_roles, profile_type, is_suspended )`,
    `category, is_active, profiles ( username, display_name, musician_category, profile_type, is_suspended )`,
    `is_active, profiles ( username, display_name, profile_type, is_suspended )`,
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
  return (await fetchDesdeRpc("productos", "prod")) ?? aggregate(await fetchJoined("products"), "prod")
}

export async function fetchServiceProviders(): Promise<DiscoveryProfile[]> {
  return (await fetchDesdeRpc("servicios", "serv")) ?? aggregate(await fetchJoined("services"), "serv")
}

import { supabase } from "@/lib/supabase"
import { parseMusicianRoles, type MusicianRole } from "@/lib/musician-roles"

// Datos para el modo "descubrimiento" del feed (secciones Servicios y
// Productos + el filtro Tienda): perfiles agrupados que ofrecen servicios o
// venden productos. No es el feed vertical de canciones/publicaciones — son
// tarjetas de perfil que enlazan a la página /[username]/tienda.

export type DiscoveryProfile = {
  profileId: string
  displayName: string
  slug: string
  roles: MusicianRole[]
  isGroup: boolean
  count: number
  categories: string[]
}

// La agregación la hace Postgres (P-16) ─────────────────────────────────────
//
// `descubrimiento_perfiles` (migración 0012) devuelve UNA fila por perfil, con
// su conteo real y sus categorías, sin traer una sola fila de producto al
// proceso. Reemplaza la agregación sobre una muestra de 500 filas, que con
// volumen simplemente mentía: un artista cuyos productos quedaban fuera de esa
// muestra desaparecía del carrusel.
//
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

  // El RPC ya ordena por conteo; se reordena también aquí para fijar el
  // contrato de salida aunque cambie la implementación SQL.
  return salida.sort((a, b) => b.count - a.count)
}

/** Cuántos perfiles se muestran en el carrusel de descubrimiento. */
const DISCOVERY_PROFILE_LIMIT = 60

async function fetchDesdeRpc(
  tipo: "productos" | "servicios",
  keyName: string
): Promise<DiscoveryProfile[]> {
  const { data, error } = await supabase.rpc("descubrimiento_perfiles", {
    p_tipo: tipo,
    p_limite: DISCOVERY_PROFILE_LIMIT,
  })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error("Respuesta inválida del descubrimiento")
  return mapearFilasRpc(data as FilaDescubrimiento[], keyName)
}

export async function fetchProductSellers(): Promise<DiscoveryProfile[]> {
  return fetchDesdeRpc("productos", "prod")
}

export async function fetchServiceProviders(): Promise<DiscoveryProfile[]> {
  return fetchDesdeRpc("servicios", "serv")
}

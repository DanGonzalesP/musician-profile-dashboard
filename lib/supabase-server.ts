import { createClient } from "@supabase/supabase-js"
import { unstable_cache } from "next/cache"
import type { DbProfileBlock } from "./blocks"

// Cliente de Supabase para Server Components y generateMetadata.
//
// Es el mismo acceso ANÓNIMO que usa el navegador (anon key + RLS), solo que
// ejecutado en el servidor. No lleva sesión de usuario a propósito: todo lo
// que se renderiza en el servidor de una página pública es, por definición,
// contenido público. Cualquier cosa que dependa de quién mira se resuelve en
// el cliente.
//
// Nunca meter acá la service role key: saltearía RLS y convertiría cualquier
// error de esta capa en una fuga de datos.
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ─── Página pública completa, resuelta en el servidor (F10 · P-18/P-19/P-21) ─
//
// Antes el perfil público se armaba con un `useEffect` en el navegador: Google
// indexaba un esqueleto, cada visita eran varios viajes secuenciales y el
// `revalidate = 300` no cacheaba nada útil porque el HTML no traía datos.
//
// Ahora las consultas (perfil, bloques, catálogo) se resuelven en el servidor,
// en paralelo, y viajan como props iniciales. **La UX no cambia**: se entregan
// las FILAS CRUDAS, exactamente como las devolvía PostgREST al navegador, y el
// mismo componente cliente las mapea con las mismas funciones que ya usaba. Ni
// un `if` de render nuevo, ni un formato distinto.

export type FilaCatalogoCruda = Record<string, unknown>

export type PerfilPublicoInicial = {
  profile: {
    id: string
    username: string
    displayName: string
    bio: string
    profileType: string
    unifiedProfile: boolean
    accentColor: string | null
  }
  blockRows: DbProfileBlock[]
  productRows: FilaCatalogoCruda[]
  serviceRows: FilaCatalogoCruda[]
}

export type ResultadoPerfilPublico =
  /** Resuelto: el HTML sale del servidor con contenido de verdad. */
  | { estado: "ok"; datos: PerfilPublicoInicial }
  /** Username antiguo: hay que redirigir al actual (no romper QR ni enlaces). */
  | { estado: "redirigir"; username: string }
  /** No existe, o está suspendido: para el visitante son lo mismo. */
  | { estado: "no-encontrado" }
  /**
   * El servidor no pudo hablar con Supabase. NO es un 404: se degrada al
   * comportamiento de siempre (el cliente carga y muestra lo que pueda). Un
   * corte transitorio de red jamás debe convertir el perfil de un artista real
   * en una página "no encontrado" cacheada.
   */
  | { estado: "sin-servidor" }

/** Etiqueta de caché por perfil, para invalidar al publicar. */
export function etiquetaPerfil(username: string): string {
  return `perfil:${username.trim().toLowerCase()}`
}

// Igualdad exacta, nunca ilike: el valor viene de la URL y los comodines de
// LIKE no deben interpretarse. Misma regla que lib/username.ts.
const USERNAME_VALIDO = /^[a-z0-9_]{3,30}$/

/**
 * Se lanza cuando Supabase no respondió. Existe para que el fallo SALGA de
 * `unstable_cache` como excepción en vez de como valor: Next no cachea una
 * promesa rechazada, así que un corte transitorio no queda congelado cinco
 * minutos en la caché del perfil. Ver `fetchPublicProfilePage`.
 */
class SinServidor extends Error {
  constructor(fuente: string) {
    super(`Supabase no respondió al leer ${fuente}`)
    this.name = "SinServidor"
  }
}

async function cargarPerfilPublico(usernameCrudo: string): Promise<ResultadoPerfilPublico> {
  const username = usernameCrudo.trim().toLowerCase()
  if (!USERNAME_VALIDO.test(username)) return { estado: "no-encontrado" }

  const supabase = createServerSupabase()

  const { data: profile, error: errorPerfil } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, profile_type, unified_profile, accent_color, is_suspended")
    .eq("username", username)
    .maybeSingle()

  if (errorPerfil) throw new SinServidor("profiles")

  if (!profile) {
    // ¿Es un username antiguo? El historial mantiene vivos los enlaces y los
    // QR ya impresos.
    const { data: historico, error: errorHistorial } = await supabase
      .from("username_history")
      .select("profile_id")
      .eq("old_username", username)
      .maybeSingle()

    if (errorHistorial) throw new SinServidor("username_history")
    if (!historico) return { estado: "no-encontrado" }

    const { data: actual, error: errorActual } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", historico.profile_id)
      .maybeSingle()

    if (errorActual) throw new SinServidor("profiles")
    return actual?.username ? { estado: "redirigir", username: actual.username } : { estado: "no-encontrado" }
  }

  // Suspensión efectiva en el render del servidor (P-34). La base ya oculta el
  // contenido por RLS; ésta es la segunda capa, y además es la que evita que
  // una página suspendida siga sirviéndose desde la caché del borde.
  if (profile.is_suspended === true) return { estado: "no-encontrado" }

  const [bloques, productos, servicios] = await Promise.all([
    supabase
      .from("profile_blocks")
      .select("id, block_type, content, position_index")
      .eq("profile_id", profile.id)
      .eq("is_visible", true)
      .order("position_index", { ascending: true }),
    // select("*") por el mismo motivo que en lib/catalog.ts: las columnas
    // nuevas pueden no existir todavía y lo que falte llega como undefined.
    supabase.from("products").select("*").eq("seller_id", profile.id).order("position_index", { ascending: true }),
    supabase.from("services").select("*").eq("profile_id", profile.id).order("position_index", { ascending: true }),
  ])

  // Si alguna de las tres falla, NO se sirve un perfil a medias: un artista
  // cuyo `profile_blocks` no se pudo leer vería su página vacía —y cacheada
  // así cinco minutos—, que para él es indistinguible de "se borró todo". Se
  // degrada al camino cliente, igual que ante cualquier otro corte.
  if (bloques.error) throw new SinServidor("profile_blocks")
  if (productos.error) throw new SinServidor("products")
  if (servicios.error) throw new SinServidor("services")

  const blockRows = bloques.data
  const productRows = productos.data
  const serviceRows = servicios.data

  return {
    estado: "ok",
    datos: {
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name ?? "",
        bio: profile.bio ?? "",
        profileType: profile.profile_type ?? "artist",
        unifiedProfile: Boolean(profile.unified_profile),
        accentColor: typeof profile.accent_color === "string" ? profile.accent_color : null,
      },
      blockRows: (blockRows ?? []) as unknown as DbProfileBlock[],
      productRows: (productRows ?? []) as FilaCatalogoCruda[],
      serviceRows: (serviceRows ?? []) as FilaCatalogoCruda[],
    },
  }
}

/**
 * Igual que `cargarPerfilPublico`, pero memorizada por username y etiquetada
 * para poder invalidarla al publicar (`app/acciones/revalidar-perfil.ts`). Sin
 * la etiqueta, un cambio del artista tardaría hasta 5 minutos en verse; con
 * ella se ve al instante, y el resto del tiempo la página no toca Supabase.
 *
 * `generateMetadata` y el render de la página llaman a esto por separado
 * (Next.js los ejecuta como dos pasadas): la memoria hace que sea UNA sola ida
 * a la base, no dos.
 *
 * El fallo de Supabase viaja como EXCEPCIÓN dentro de la función cacheada y se
 * traduce a `sin-servidor` acá fuera. Es deliberado: Next no guarda en caché
 * una promesa rechazada, así que un corte de treinta segundos no deja el perfil
 * degradado durante los cinco minutos de `revalidate`. Devolverlo como valor sí
 * lo habría cacheado.
 */
export async function fetchPublicProfilePage(username: string): Promise<ResultadoPerfilPublico> {
  const clave = username.trim().toLowerCase()
  const cacheada = unstable_cache(() => cargarPerfilPublico(clave), ["perfil-publico", clave], {
    revalidate: 300,
    tags: [etiquetaPerfil(clave)],
  })
  try {
    return await cacheada()
  } catch {
    return { estado: "sin-servidor" }
  }
}

export type PublicProfileMeta = {
  id: string
  username: string
  displayName: string
  bio: string
  profileType: string
  /** Foto del artista, sacada del bloque hero — se usa como imagen social. */
  image?: string
  banner?: string
  tagline?: string
  location?: string
}

/**
 * Datos de cabecera para los metadatos (título, descripción, imagen de Open
 * Graph). Devuelve null si el username no se puede resolver.
 *
 * Se apoya en la misma carga cacheada que la página: antes hacía dos consultas
 * propias (perfil + bloque hero) que se sumaban a las del render.
 */
export async function fetchProfileMeta(username: string): Promise<PublicProfileMeta | null> {
  const resultado = await fetchPublicProfilePage(username)
  if (resultado.estado !== "ok") return null

  const { profile, blockRows } = resultado.datos

  // El hero guarda la foto, el banner, el lema y la ubicación dentro de su
  // JSONB de contenido — es lo que da una tarjeta social decente.
  const hero = (blockRows.find((b) => b.block_type === "hero")?.content ?? {}) as {
    image?: string
    banner?: string
    tagline?: string
    location?: string
  }

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName || profile.username,
    bio: profile.bio,
    profileType: profile.profileType,
    image: typeof hero.image === "string" && hero.image ? hero.image : undefined,
    banner: typeof hero.banner === "string" && hero.banner ? hero.banner : undefined,
    tagline: typeof hero.tagline === "string" ? hero.tagline : undefined,
    location: typeof hero.location === "string" ? hero.location : undefined,
  }
}

import { createClient } from "@supabase/supabase-js"

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
 * Datos mínimos de un perfil para generar los metadatos (título, descripción,
 * imagen de Open Graph). Devuelve null si el username no existe.
 *
 * Se mantiene aparte de la carga completa de la página: generateMetadata y el
 * render corren por separado en Next.js, y acá solo hace falta la cabecera.
 */
export async function fetchProfileMeta(username: string): Promise<PublicProfileMeta | null> {
  const supabase = createServerSupabase()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, profile_type")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle()

  if (!profile) return null

  // El hero guarda la foto, el banner, el lema y la ubicación dentro de su
  // JSONB de contenido — es lo que da una tarjeta social decente.
  const { data: heroBlock } = await supabase
    .from("profile_blocks")
    .select("content")
    .eq("profile_id", profile.id)
    .eq("block_type", "hero")
    .eq("is_visible", true)
    .maybeSingle()

  const hero = (heroBlock?.content ?? {}) as {
    image?: string
    banner?: string
    tagline?: string
    location?: string
  }

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    bio: profile.bio || "",
    profileType: profile.profile_type || "artist",
    image: typeof hero.image === "string" && hero.image ? hero.image : undefined,
    banner: typeof hero.banner === "string" && hero.banner ? hero.banner : undefined,
    tagline: typeof hero.tagline === "string" ? hero.tagline : undefined,
    location: typeof hero.location === "string" ? hero.location : undefined,
  }
}

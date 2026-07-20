// Helper isomórfico para los créditos externos del Bloque 4 (Créditos y
// Colaboraciones): detectar la plataforma de un enlace, autocompletar sus
// metadatos (título/artista/miniatura) desde el editor, y construir URLs de
// embed reproducibles en el perfil público SIN depender de red ni de
// terceros en cada carga de página.
//
// fetchOembedMetadata pega contra app/api/oembed/route.ts y SOLO se usa
// desde el editor — el perfil público nunca debe depender de un servicio de
// terceros (ni de nuestra propia API) para renderizar, por eso las funciones
// de embed de más abajo son puras (sin fetch).

import { getYoutubeEmbedUrl } from "@/lib/youtube"

export type OembedProvider = "youtube" | "spotify" | "soundcloud" | "tiktok" | "facebook" | "instagram"

export type OembedMetadata = {
  provider: OembedProvider
  title: string
  authorName: string
  thumbnailUrl?: string
  embedUrl?: string
  fallback?: boolean
}

function normalizedHostname(url: string): string {
  return new URL(url.trim()).hostname.replace(/^www\./, "")
}

// Detecta la plataforma de un enlace externo a partir de su hostname. Se usa
// tanto en el editor (para saber a qué oEmbed pegar) como en el perfil
// público (para saber qué función de embed puro invocar).
export function detectOembedProvider(url: string): OembedProvider | null {
  try {
    const hostname = normalizedHostname(url)
    if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) return "youtube"
    if (hostname === "open.spotify.com") return "spotify"
    if (hostname === "soundcloud.com") return "soundcloud"
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok"
    if (hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch") return "facebook"
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram"
    return null
  } catch {
    return null
  }
}

// Autocompletado de metadatos al pegar un enlace en el editor. Nunca se
// llama desde el perfil público.
export async function fetchOembedMetadata(url: string): Promise<OembedMetadata | null> {
  const res = await fetch(`/api/oembed?url=${encodeURIComponent(url.trim())}`)
  if (!res.ok) return null
  return (await res.json()) as OembedMetadata
}

// Spotify embebe cualquier track/album/playlist/episode insertando "embed"
// como primer segmento del path: open.spotify.com/track/ID ->
// open.spotify.com/embed/track/ID.
export function getSpotifyEmbedUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    if (normalizedHostname(trimmed) !== "open.spotify.com") return null
    const u = new URL(trimmed)
    const segments = u.pathname.split("/").filter(Boolean)
    if (segments.length === 0) return null
    return `https://open.spotify.com/embed/${segments.join("/")}`
  } catch {
    return null
  }
}

// SoundCloud ofrece un iframe universal que acepta cualquier URL de
// track/set pública como parámetro.
export function getSoundcloudEmbedUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    if (normalizedHostname(trimmed) !== "soundcloud.com") return null
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(trimmed)}&color=%23ff5500&auto_play=false&show_teaser=false`
  } catch {
    return null
  }
}

// Plugin público de Facebook para posts/videos públicos — funciona sin
// token de app.
export function getFacebookEmbedUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    const hostname = normalizedHostname(trimmed)
    if (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com") && hostname !== "fb.watch") return null
    return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(trimmed)}&show_text=false&width=500`
  } catch {
    return null
  }
}

// Instagram embebe posts públicos agregando /embed/ al final de la URL —
// también funciona sin token de app.
export function getInstagramEmbedUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    if (normalizedHostname(trimmed) !== "instagram.com" && !normalizedHostname(trimmed).endsWith(".instagram.com")) {
      return null
    }
    const withoutTrailingSlash = trimmed.replace(/\/+$/, "")
    return `${withoutTrailingSlash}/embed/`
  } catch {
    return null
  }
}

// Conveniencia usada por el perfil público: detecta la plataforma y arma la
// URL de embed sin tocar la red. TikTok siempre devuelve null a propósito —
// política ya establecida en este proyecto (ver components/inspector/embeds-fields.tsx):
// sin script embed.tiktok.com de terceros. Para TikTok el bloque público
// debe mostrar la miniatura + un botón "Ver en TikTok" que abre el enlace en
// una pestaña nueva.
export function getExternalEmbedUrl(url: string): string | null {
  const provider = detectOembedProvider(url)
  switch (provider) {
    case "youtube":
      return getYoutubeEmbedUrl(url)
    case "spotify":
      return getSpotifyEmbedUrl(url)
    case "soundcloud":
      return getSoundcloudEmbedUrl(url)
    case "facebook":
      return getFacebookEmbedUrl(url)
    case "instagram":
      return getInstagramEmbedUrl(url)
    case "tiktok":
    default:
      return null
  }
}

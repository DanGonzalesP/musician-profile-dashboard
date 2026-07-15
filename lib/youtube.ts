// Utilidades para el crédito "Externo (YouTube)" del Bloque 4: extraer el
// videoId de cualquier formato de enlace de YouTube y consultar su oEmbed
// público (sin API key) para autocompletar título/canal.

function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v")
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] ?? null
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] ?? null
    }
    return null
  } catch {
    return null
  }
}

export function getYoutubeEmbedUrl(url: string): string | null {
  const videoId = extractYoutubeVideoId(url)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null
}

export type YoutubeMetadata = {
  videoId: string
  title: string
  authorName: string
}

export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata | null> {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) return null

  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`)
  if (!res.ok) return null

  const data = (await res.json()) as { title?: string; author_name?: string }
  return {
    videoId,
    title: String(data.title ?? ""),
    authorName: String(data.author_name ?? ""),
  }
}

// Utilidades para resolver el videoId de cualquier formato de enlace de
// YouTube y construir su URL de embed — usado por los bloques que reproducen
// YouTube en vivo (Publicaciones/Embeds, Créditos y Colaboraciones vía
// lib/oembed.ts).

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

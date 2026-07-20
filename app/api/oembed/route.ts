import { NextResponse } from "next/server"
import {
  detectOembedProvider,
  getFacebookEmbedUrl,
  getInstagramEmbedUrl,
  type OembedMetadata,
  type OembedProvider,
} from "@/lib/oembed"

// Autocompletado de metadatos (título, artista principal, miniatura) al
// pegar un enlace externo en un crédito del Bloque 4. Corre server-side para
// evitar problemas de CORS contra los oEmbed de terceros y para poder sumar
// un token de Meta cuando exista. Solo lee metadata pública, así que no
// requiere autenticación (mismo estilo de manejo de errores que
// app/api/upload-url/route.ts y app/api/generate-image/route.ts).
//
// Nunca debe bloquear al usuario: cualquier falla de red/parseo contra el
// oEmbed de terceros responde 200 con fallback: true y strings vacíos — el
// cliente ya sabe mostrar "no se pudo leer, completa manualmente". Solo un
// request inválido (sin url, o plataforma no soportada) responde 400.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "El parámetro url es requerido" }, { status: 400 })
    }

    const provider = detectOembedProvider(url)
    if (!provider) {
      return NextResponse.json({ error: "Plataforma no soportada" }, { status: 400 })
    }

    const metadata = await resolveOembed(provider, url)
    return NextResponse.json(metadata)
  } catch (error: any) {
    console.error("[api/oembed]", error)
    return NextResponse.json({ error: error.message ?? "No se pudo leer el enlace" }, { status: 500 })
  }
}

async function resolveOembed(provider: OembedProvider, url: string): Promise<OembedMetadata> {
  switch (provider) {
    case "youtube":
      return fetchNativeOembed(provider, `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    case "spotify":
      return fetchNativeOembed(provider, `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    case "soundcloud":
      return fetchNativeOembed(provider, `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    case "tiktok":
      return fetchNativeOembed(provider, `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    case "facebook":
      return fetchMetaOembed("facebook", url)
    case "instagram":
      return fetchMetaOembed("instagram", url)
  }
}

// YouTube/Spotify/SoundCloud/TikTok: soporte nativo completo, sin token. Cada
// endpoint usa nombres de campo levemente distintos (title / author_name /
// thumbnail_url) — se normalizan acá a un shape común. Si el fetch falla o
// la plataforma responde con error, nunca tiramos excepción: devolvemos
// fallback: true.
async function fetchNativeOembed(provider: OembedProvider, endpoint: string): Promise<OembedMetadata> {
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } })
    if (!res.ok) {
      return { provider, title: "", authorName: "", fallback: true }
    }
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    return {
      provider,
      title: String(data.title ?? ""),
      authorName: String(data.author_name ?? ""),
      thumbnailUrl: data.thumbnail_url ? String(data.thumbnail_url) : undefined,
    }
  } catch (error) {
    console.error(`[api/oembed] ${provider}`, error)
    return { provider, title: "", authorName: "", fallback: true }
  }
}

// Facebook e Instagram requieren un token de app de Meta para el oEmbed
// oficial de Graph API (oembed_post / instagram_oembed). Leemos
// process.env.META_APP_ACCESS_TOKEN igual que ya se hace en este proyecto
// con TOGETHER_API_KEY o R2_ENDPOINT: una sola variable de entorno plana,
// sin capa de config extra.
//
// Si la variable no existe (caso esperado por ahora, no hay Meta app
// configurada todavía) o la llamada a Graph API falla, igual respondemos 200
// con fallback: true y un embedUrl que funciona públicamente sin token
// (plugin de Facebook / sufijo /embed/ de Instagram) para que el bloque
// público siga pudiendo reproducir el contenido aunque el editor no haya
// podido autocompletar título/artista.
async function fetchMetaOembed(provider: "facebook" | "instagram", url: string): Promise<OembedMetadata> {
  const token = process.env.META_APP_ACCESS_TOKEN
  const publicEmbedUrl =
    (provider === "facebook" ? getFacebookEmbedUrl(url) : getInstagramEmbedUrl(url)) ?? undefined

  if (!token) {
    return { provider, title: "", authorName: "", thumbnailUrl: undefined, embedUrl: publicEmbedUrl, fallback: true }
  }

  try {
    const graphEndpoint =
      provider === "facebook"
        ? `https://graph.facebook.com/v19.0/oembed_post?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}`
        : `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}`

    const res = await fetch(graphEndpoint, { headers: { Accept: "application/json" } })
    if (!res.ok) {
      return { provider, title: "", authorName: "", thumbnailUrl: undefined, embedUrl: publicEmbedUrl, fallback: true }
    }

    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    return {
      provider,
      title: String(data.title ?? ""),
      authorName: String(data.author_name ?? ""),
      thumbnailUrl: data.thumbnail_url ? String(data.thumbnail_url) : undefined,
      embedUrl: publicEmbedUrl,
    }
  } catch (error) {
    console.error(`[api/oembed] ${provider}`, error)
    return { provider, title: "", authorName: "", thumbnailUrl: undefined, embedUrl: publicEmbedUrl, fallback: true }
  }
}

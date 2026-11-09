import { getCloudflareContext } from "@opennextjs/cloudflare"

export const dynamic = "force-dynamic"

const ASSET_KEY = "ffmpeg-core.wasm"
const ASSET_PATH = "/ffmpeg/ffmpeg-core.wasm"
// La ruta no contiene versión: al actualizar el core no debe conservar un
// WASM incompatible durante un año en los navegadores que ya lo descargaron.
const CACHE_CONTROL = "public, max-age=0, must-revalidate"

type AssetMetadata = {
  size: number
  etag: string
  httpEtag?: string
}

type AssetObject = AssetMetadata & {
  body: ReadableStream<Uint8Array>
}

type StaticAssetBucket = {
  get(key: string): Promise<AssetObject | null>
  head(key: string): Promise<AssetMetadata | null>
}

function bucket(): StaticAssetBucket | null {
  try {
    const env = getCloudflareContext().env as unknown as {
      VIBE_STATIC_ASSETS?: StaticAssetBucket
    }
    return env.VIBE_STATIC_ASSETS ?? null
  } catch {
    return null
  }
}

function headers(asset: AssetMetadata): Headers {
  return new Headers({
    "Content-Type": "application/wasm",
    "Content-Length": String(asset.size),
    "Cache-Control": CACHE_CONTROL,
    ETag: asset.httpEtag ?? `"${asset.etag.replaceAll('"', "")}"`,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-site",
  })
}

function isExpectedAsset(request: Request): boolean {
  return new URL(request.url).pathname === ASSET_PATH
}

export async function GET(request: Request): Promise<Response> {
  if (!isExpectedAsset(request)) return new Response(null, { status: 404 })

  const assets = bucket()
  if (!assets) return new Response("Asset no disponible", { status: 503 })

  try {
    const asset = await assets.get(ASSET_KEY)
    if (!asset) return new Response("Asset no disponible", { status: 404 })

    const responseHeaders = headers(asset)
    if (request.headers.get("if-none-match") === responseHeaders.get("etag")) {
      await asset.body.cancel()
      responseHeaders.delete("Content-Length")
      return new Response(null, { status: 304, headers: responseHeaders })
    }
    return new Response(asset.body, { headers: responseHeaders })
  } catch {
    return new Response("Asset no disponible", { status: 503 })
  }
}

export async function HEAD(request: Request): Promise<Response> {
  if (!isExpectedAsset(request)) return new Response(null, { status: 404 })

  const assets = bucket()
  if (!assets) return new Response(null, { status: 503 })

  try {
    const asset = await assets.head(ASSET_KEY)
    return asset
      ? new Response(null, { headers: headers(asset) })
      : new Response(null, { status: 404 })
  } catch {
    return new Response(null, { status: 503 })
  }
}

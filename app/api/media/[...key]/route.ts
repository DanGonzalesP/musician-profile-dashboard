import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { subidasR2Configuradas } from "@/lib/r2-config"
import { mediaHeaders, mediaRange, safeMediaType, validMediaKey } from "@/lib/media-delivery"
import { logError } from "@/lib/log"

export const dynamic = "force-dynamic"
type Context = { params: Promise<{ key: string[] }> }

async function deliver(request: NextRequest, context: Context): Promise<Response> {
  const headers = mediaHeaders()
  const denied = (status: number) => new Response(null, { status, headers })
  try {
    const key = (await context.params).key.join("/")
    if (!validMediaKey(key)) return denied(404)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey || !subidasR2Configuradas()) return denied(503)
    // <img>/<audio> no envían Bearer: se usa la misma sesión SSR del editor.
    // PostgREST valida el JWT; nunca se confía en un user_id proporcionado.
    const authorization = request.headers.get("authorization")
    const refreshed: { name: string; value: string; options: import("@supabase/ssr").CookieOptions }[] = []
    const supabase = createServerClient(url, anonKey, {
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        ...(authorization ? { headers: { Authorization: authorization } } : {}),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => values.forEach(({ name, value, options }) => {
          // Set-Cookie requiere serialización completa; NextResponse se encarga
          // abajo de propagar la renovación sin cachearla.
          refreshed.push({ name, value, options })
        }),
      },
    })
    const { data, error } = await supabase.rpc("resolve_media_read", { p_key: key })
    if (error) return denied(503)
    if (!Array.isArray(data) || data.length !== 1) return denied(404)
    const asset = data[0]
    if (!safeMediaType(asset.content_type) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) return denied(404)
    // HEAD ignora Range por semántica HTTP. GET autoriza antes de revelar tamaño.
    const range = mediaRange(request.method === "HEAD" ? null : request.headers.get("range"), asset.bytes)
    if (range === false) {
      headers.set("Content-Range", `bytes */${asset.bytes}`)
      return denied(416)
    }
    const input = { Bucket: R2_BUCKET_NAME, Key: key }
    const expectedLength = range ? range.end - range.start + 1 : asset.bytes
    const result = request.method === "HEAD"
      ? await r2Client.send(new HeadObjectCommand(input), { abortSignal: request.signal })
      : await r2Client.send(new GetObjectCommand({ ...input,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }), { abortSignal: request.signal })
    const body = "Body" in result ? result.Body : undefined
    const contentRange = range ? `bytes ${range.start}-${range.end}/${asset.bytes}` : undefined
    if ((request.method !== "HEAD" && !body) || result.ContentType !== asset.content_type || result.ContentLength !== expectedLength ||
      (range && (!("ContentRange" in result) || result.ContentRange !== contentRange))) {
      if (body) await body.transformToWebStream().cancel()
      return denied(404)
    }
    headers.set("Content-Type", asset.content_type)
    headers.set("Content-Length", String(expectedLength))
    headers.set("Accept-Ranges", "bytes")
    if (contentRange) headers.set("Content-Range", contentRange)
    // Nunca redirigir a una URL firmada: cada nueva petición vuelve a autorizar.
    const response = new NextResponse(body?.transformToWebStream() ?? null, { status: range ? 206 : 200, headers })
    refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    return response
  } catch {
    // No registrar key, JWT, URL firmada ni errores crudos del proveedor.
    logError("api/media", "no se pudo entregar el archivo", new Error("media_delivery_failed"))
    return denied(503)
  }
}

export const GET = deliver
export const HEAD = deliver

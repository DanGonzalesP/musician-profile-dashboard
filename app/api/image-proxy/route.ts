import { type NextRequest } from "next/server"
import { GET as readMedia } from "@/app/api/media/[...key]/route"
import { mediaHeaders } from "@/lib/media-delivery"
import { mediaKeyFromUrl } from "@/lib/media-url"

export const dynamic = "force-dynamic"

/** Compatibilidad con tarjetas PDF antiguas. Nunca solicita el origen público:
 * usa exactamente la autorización y la entrega privada de la ruta de medios. */
export async function GET(request: NextRequest) {
  const key = mediaKeyFromUrl(request.nextUrl.searchParams.get("url"))
  if (!key?.startsWith("images/")) return new Response(null, { status: 400, headers: mediaHeaders() })
  const response = await readMedia(request, { params: Promise.resolve({ key: key.split("/") }) })
  if (response.ok && (!response.headers.get("content-type")?.startsWith("image/") ||
    Number(response.headers.get("content-length")) > 10 * 1024 * 1024)) {
    await response.body?.cancel()
    return new Response(null, { status: 415, headers: mediaHeaders() })
  }
  return response
}

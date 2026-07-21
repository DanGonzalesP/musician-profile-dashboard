import { NextResponse } from "next/server"
import { R2_PUBLIC_URL } from "@/lib/r2"

// Reenvía imágenes públicas de R2 mismo-origen para el navegador. Necesario
// porque <canvas>.toDataURL() sobre una imagen cross-origin sin cabeceras
// CORS que calcen exactamente con el dominio actual "mancha" el canvas y
// lanza SecurityError — pasa siempre que el bucket solo tiene whitelisteado
// localhost/*.vercel.app (ver scripts/setup-r2-cors.mjs) y la app corre en
// otro dominio. Sirviendo la imagen desde este mismo origen, el canvas ya
// nunca la ve como cross-origin, sin depender de la config de CORS del bucket.
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url")
  if (!target || !target.startsWith(R2_PUBLIC_URL)) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 })
  }

  const upstream = await fetch(target)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "No se pudo cargar la imagen" }, { status: upstream.status || 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}

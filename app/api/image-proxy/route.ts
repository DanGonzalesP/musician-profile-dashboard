import { NextResponse } from "next/server"
import { R2_PUBLIC_URL } from "@/lib/r2"
import { leerConTope } from "@/lib/stream-limit"

// Reenvía imágenes públicas de R2 mismo-origen para el navegador. Necesario
// porque <canvas>.toDataURL() sobre una imagen cross-origin sin cabeceras
// CORS que calcen exactamente con el dominio actual "mancha" el canvas y
// lanza SecurityError — pasa siempre que el bucket solo tiene whitelisteado
// localhost/*.workers.dev (ver scripts/setup-r2-cors.mjs) y la app corre en
// otro dominio. Sirviendo la imagen desde este mismo origen, el canvas ya
// nunca la ve como cross-origin, sin depender de la config de CORS del bucket.
//
// SEGURIDAD — este endpoint hace un fetch server-side con una URL que manda
// el cliente, o sea que es un SSRF en potencia: sin los controles de abajo,
// cualquiera lo usa para pedir recursos desde la IP de nuestro Worker (redes
// internas alcanzables desde el borde, metadata del proveedor, escaneo de
// puertos) o para lavar tráfico contra terceros.
//
// La versión anterior validaba con `target.startsWith(R2_PUBLIC_URL)`, que es
// insuficiente: si R2_PUBLIC_URL es "https://pub-abc.r2.dev", entonces
// "https://pub-abc.r2.dev.atacante.com/x" también pasa el startsWith. Por eso
// ahora se compara el ORIGEN ya parseado, que no se puede prefijar.

// Techo de tamaño: una portada/avatar de R2 ya viene comprimida a <500KB
// (ver compressImage en profile-editor). 10MB deja margen de sobra y evita
// que alguien use la ruta para tunelizar archivos grandes.
const MAX_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 5000

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url")
  if (!target) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 })
  }

  // Origen exacto, no prefijo. Cualquier host que no sea literalmente el del
  // bucket público queda fuera.
  let targetUrl: URL
  let allowedOrigin: string
  try {
    targetUrl = new URL(target)
    allowedOrigin = new URL(R2_PUBLIC_URL).origin
  } catch {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 })
  }

  if (targetUrl.origin !== allowedOrigin || targetUrl.protocol !== "https:") {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 })
  }

  // Timeout propio: sin esto, un upstream colgado mantiene viva la función
  // serverless hasta que la mata la plataforma.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      // Un redirect podría sacarnos del origen ya validado — se corta acá.
      redirect: "error",
    })
  } catch {
    clearTimeout(timeout)
    return NextResponse.json({ error: "No se pudo cargar la imagen" }, { status: 502 })
  }
  clearTimeout(timeout)

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "No se pudo cargar la imagen" }, { status: upstream.status || 502 })
  }

  // El bucket es público y acepta subidas de tipo image/audio/video; esta ruta
  // existe solo para imágenes, así que se rechaza cualquier otra cosa en vez
  // de reenviarla a ciegas.
  const contentType = upstream.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "El recurso no es una imagen" }, { status: 415 })
  }

  // Atajo barato: si el upstream declara un tamaño que ya supera el techo, no
  // hace falta descargar nada.
  const declaredLength = Number(upstream.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BYTES) {
    await upstream.body.cancel().catch(() => {})
    return NextResponse.json({ error: "La imagen es demasiado grande" }, { status: 413 })
  }

  // P-06 — el Content-Length es una DECLARACIÓN del upstream, no una medida:
  // puede faltar (respuesta troceada), venir en 0 o venir mentida. Antes el
  // cuerpo se reenviaba como stream sin contar un solo byte, así que el techo
  // de 10 MB no lo aplicaba nadie. Ahora se cuenta de verdad. Ver
  // lib/stream-limit.ts para por qué se bufferiza en vez de encadenar un
  // TransformStream (resumen: sin buffer no se puede devolver un 413 honesto).
  let lectura
  try {
    lectura = await leerConTope(upstream.body, MAX_BYTES)
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la imagen" }, { status: 502 })
  }

  if (lectura.excedido) {
    return NextResponse.json({ error: "La imagen es demasiado grande" }, { status: 413 })
  }

  return new NextResponse(lectura.bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(lectura.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      // El navegador nunca debe reinterpretar esto como otra cosa.
      "X-Content-Type-Options": "nosniff",
      // `Cross-Origin-Resource-Policy` NO se pone acá: la regla general de
      // next.config.mjs ya cubre esta ruta con `same-site`, y declararla
      // también aquí haría que la respuesta saliera con la cabecera dos veces,
      // que es un valor inválido y el navegador puede descartar entero.
    },
  })
}

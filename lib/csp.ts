const origenPermitido = (valor: string | undefined, esDesarrollo: boolean): string | null => {
  if (!valor) return null

  try {
    const url = new URL(valor)
    if (url.protocol === "https:") return url.origin

    const esLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost"
    return esDesarrollo && esLocal && url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

const unicos = (valores: Array<string | null>): string[] =>
  Array.from(new Set(valores.filter((valor): valor is string => Boolean(valor))))

/**
 * Los orígenes contra los que el navegador puede hacer el PUT firmado de una
 * subida a R2. Son DOS, y omitir el segundo rompe todas las subidas.
 *
 * ─── POR QUÉ DOS ──────────────────────────────────────────────────────────
 * `/api/upload-url` firma con el SDK de S3, que por defecto usa el estilo
 * **virtual-hosted**: el bucket va como subdominio del endpoint. Con
 * `R2_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com` y
 * `R2_BUCKET_NAME=vibe`, la URL que recibe el navegador es
 *
 *     https://vibe.<cuenta>.r2.cloudflarestorage.com/images/....webp?X-Amz-...
 *
 * y ese host **no es** el origen de `R2_ENDPOINT`: es un subdominio suyo. Una
 * CSP que sólo liste el endpoint desnudo bloquea el PUT con
 * "Refused to connect", el editor lo reporta como `TypeError: Failed to fetch`
 * y la publicación falla entera. Lo detectó `tests/e2e-auth/editor-teclado-y-subidas.spec.ts`
 * en su primera corrida; antes de F8 no había forma automática de verlo,
 * porque subir exige sesión.
 *
 * Se listan los dos orígenes **exactos** y no un comodín `https://*.r2...`:
 * el nombre del bucket lo sabemos, así que no hay motivo para abrir la puerta
 * a cualquier bucket de cualquier cuenta de Cloudflare. Si algún día se
 * activara `forcePathStyle`, la URL volvería al endpoint desnudo — que también
 * está en la lista, así que ese cambio no rompería nada.
 *
 * `R2_BUCKET_NAME` es una variable de servidor. Esto corre en `proxy.ts`, que
 * es Edge middleware: la lee sin exponerla al navegador. Igual que
 * `R2_ENDPOINT`, tiene que existir **en el entorno de build** de Vercel — ver
 * `lib/r2-config.ts` y `docs/rotacion-de-credenciales.md`.
 */
const origenesDeSubidaR2 = (endpoint: string | null): string[] => {
  if (!endpoint) return []

  const bucket = (process.env.R2_BUCKET_NAME ?? "").trim()
  if (!bucket) return [endpoint]

  try {
    const url = new URL(endpoint)
    // Si el endpoint ya trae el bucket como subdominio (configuración también
    // válida), no se duplica.
    if (url.hostname.startsWith(`${bucket}.`)) return [endpoint]
    return [endpoint, `${url.protocol}//${bucket}.${url.host}`]
  } catch {
    return [endpoint]
  }
}

/**
 * CSP estricta de Vibe. Los orígenes configurables se aceptan únicamente si
 * son HTTPS válidos; una variable ausente o inválida no amplía la política.
 */
export function crearCsp(nonce: string, esDesarrollo: boolean): string {
  const origenSupabase = origenPermitido(process.env.NEXT_PUBLIC_SUPABASE_URL, esDesarrollo)
  const origenR2Publico = origenPermitido(process.env.NEXT_PUBLIC_R2_PUBLIC_URL, esDesarrollo)
  const origenR2Subidas = origenPermitido(process.env.R2_ENDPOINT, esDesarrollo)

  const imagenes = unicos([
    "'self'",
    "data:",
    "blob:",
    origenR2Publico,
    // Miniaturas devueltas por los oEmbed admitidos.
    "https://i.ytimg.com",
    "https://img.youtube.com",
    "https://i.scdn.co",
    "https://*.sndcdn.com",
    "https://*.fbcdn.net",
    "https://*.cdninstagram.com",
    // TikTok es el único proveedor admitido cuya miniatura quedaba fuera de
    // esta lista: `app/api/oembed/route.ts` devuelve el `thumbnail_url` de su
    // oEmbed, el editor lo guarda como portada del crédito y el perfil público
    // lo pinta en un <img> que la CSP bloqueaba. El host cambia en cada
    // respuesta según la región y el punto de presencia que atienda
    // (p16-sign-va.tiktokcdn.com, p19-sign.tiktokcdn-us.com...), así que el
    // comodín va en el subdominio de los dos dominios oficiales de su CDN.
    // No se abre `https:` entero ni el apex: cualquier otro host sigue
    // bloqueado.
    "https://*.tiktokcdn.com",
    "https://*.tiktokcdn-us.com",
    // Activos de muestra que conserva el feed cuando no hay catálogo.
    "https://picsum.photos",
  ])

  const conexiones = unicos([
    "'self'",
    "blob:",
    origenSupabase,
    origenSupabase ? origenSupabase.replace(/^https:/, "wss:").replace(/^http:/, "ws:") : null,
    origenR2Publico,
    ...origenesDeSubidaR2(origenR2Subidas),
    // A donde REPORTA Cloudflare Web Analytics (reemplaza a
    // vitals.vercel-insights.com con la migración). `connect-src` no tiene
    // 'strict-dynamic', así que aquí el host sí es lo que autoriza la
    // conexión: sin esta entrada el beacon carga pero no puede enviar nada.
    "https://cloudflareinsights.com",
  ])

  const directivas = [
    "default-src 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      "blob:",
      // De donde se DESCARGA el beacon de Cloudflare Web Analytics.
      //
      // Con 'strict-dynamic' presente los navegadores que lo soportan IGNORAN
      // esta lista de hosts: el beacon carga porque lo inserta el bundle de
      // React, que sí viene con nonce, y 'strict-dynamic' propaga esa
      // confianza a los scripts que ese código crea. La entrada se deja
      // igualmente para los navegadores sin soporte de 'strict-dynamic', que
      // caen al comportamiento clásico de lista de hosts.
      "https://static.cloudflareinsights.com",
      esDesarrollo ? "'unsafe-eval'" : null,
    ].filter(Boolean).join(" "),
    // Vibe usa estilos React calculados en runtime. La excepción se limita a
    // CSS: nunca habilita ejecución de JavaScript inline.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imagenes.join(" ")}`,
    `media-src ${unicos(["'self'", "blob:", origenR2Publico, "https://www.soundhelix.com"]).join(" ")}`,
    `connect-src ${conexiones.join(" ")}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://w.soundcloud.com https://www.facebook.com https://web.facebook.com https://www.instagram.com https://instagram.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ]

  return directivas.join("; ")
}

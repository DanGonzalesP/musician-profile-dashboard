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
    origenR2Subidas,
    "https://vitals.vercel-insights.com",
  ])

  const directivas = [
    "default-src 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      "blob:",
      "https://va.vercel-scripts.com",
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

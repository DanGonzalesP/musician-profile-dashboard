const securityHeaders = [
  // La CSP no puede ser estática: proxy.ts genera un nonce criptográfico para
  // cada documento y la añade tanto a la request como a la response. Ver
  // lib/csp.ts. Mantenerla aquí crearía dos políticas incompatibles.
  // 2 años de HTTPS forzado, incluyendo subdominios.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara/micrófono/geolocalización desde el navegador.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // ─── Aislamiento entre orígenes (F4 · P-10) ──────────────────────────────
  //
  // COOP corta el vínculo `window.opener` con cualquier documento de otro
  // origen: una ventana ajena que abra Vibe deja de tener una referencia viva
  // a ella. Se comprobó antes de ponerlo que la app NO abre ninguna ventana
  // emergente —no hay un solo `window.open`, y el login es correo/contraseña,
  // sin OAuth por popup—, así que no hay flujo que esto pueda romper. Lo que sí
  // se usa es `navigator.share`, al que COOP no le afecta.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

// CORP dice quién puede CARGAR estos recursos desde otro documento. Va aparte
// de la lista de arriba porque tiene una excepción obligatoria:
//
//   • Todo el sitio → `same-site`. Nadie externo debe poder incrustar el JS,
//     el CSS ni las imágenes de Vibe. Es coherente con `frame-ancestors 'self'`
//     y con el `X-Frame-Options` de arriba.
//
//   • La tarjeta social (`/<username>/opengraph-image`) → `cross-origin`, y
//     tiene que serlo. Esa imagen existe justamente para que la pinte OTRO
//     sitio: cuando alguien pega el enlace en WhatsApp Web, Slack o Discord, el
//     navegador la pide como subrecurso de un documento ajeno. Con `same-site`
//     el navegador la descarta y el artista comparte un enlace sin imagen —el
//     problema exacto que P-19 acaba de arreglar—. No filtra nada: es una
//     imagen pública compuesta con datos ya públicos.
//
// Las dos reglas son EXCLUYENTES por construcción (la específica va primero y
// la general excluye esa ruta), para que ninguna respuesta salga con la
// cabecera repetida.
const CORP_GENERAL = { key: "Cross-Origin-Resource-Policy", value: "same-site" }
const CORP_TARJETA_SOCIAL = { key: "Cross-Origin-Resource-Policy", value: "cross-origin" }

/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript SÍ corre en el build. Estaba en ignoreBuildErrors: true, lo que
  // desactivaba justo la red que protege un código de 21.000 líneas con JSONB
  // sin esquema. El proyecto compila con 0 errores, así que no había ninguna
  // deuda que justificara mantenerlo apagado.
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  // Sólo afecta a `next dev`: en desarrollo Next bloquea las peticiones a sus
  // recursos internos (`/_next/...`) que no vengan del host con el que arrancó
  // —`localhost`—, y con ellas el arranque del cliente.
  //
  // Playwright levanta el servidor y navega por `127.0.0.1` (ver
  // playwright.config.ts), que para Next es OTRO origen. El síntoma no era un
  // error rojo sino algo peor: la página se servía entera desde el servidor,
  // React nunca hidrataba, y la suite E2E pasaba en verde comprobando sólo el
  // HTML. Cualquier prueba de interacción habría pasado por el motivo
  // equivocado. Se detectó porque el aviso de cookies —que es puro cliente— no
  // aparecía nunca.
  //
  // No tiene ningún efecto en producción: `next build`/`next start` no leen
  // esta opción.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // El orden importa: la excepción de la tarjeta social va antes que la
      // regla general, y la general la excluye con un lookahead para que
      // ninguna respuesta lleve dos veces la misma cabecera.
      {
        source: "/:username/opengraph-image",
        headers: [CORP_TARJETA_SOCIAL],
      },
      {
        source: "/:ruta((?!.*opengraph-image).*)",
        headers: [CORP_GENERAL],
      },
    ]
  },
}

export default nextConfig

// Cabeceras de seguridad para TODA la app. La CSP está calibrada para lo que
// Vibe realmente usa: Supabase (HTTPS + WebSocket), subidas directas a R2,
// imágenes/audio/video remotos, iframes de YouTube, ffmpeg.wasm (workers +
// WebAssembly) y los scripts inline de Next.js. Si agregas un servicio de
// terceros nuevo (otro CDN, otra API), amplía aquí la directiva que toque.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Next.js inyecta scripts inline; ffmpeg.wasm necesita 'wasm-unsafe-eval';
  // Vercel Analytics carga desde va.vercel-scripts.com.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  // Portadas/avatares/fotos viven en R2 y en dominios externos (YouTube
  // thumbnails, picsum de ejemplo...) — https: genérico, nunca http:.
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  // Supabase (REST + Realtime) y el PUT directo a R2 con URL firmada.
  "connect-src 'self' https: wss:",
  "font-src 'self' data:",
  // Workers de ffmpeg.wasm y browser-image-compression.
  "worker-src 'self' blob:",
  // Embeds reproducibles en el perfil (créditos/colaboraciones y embeds):
  // YouTube, Spotify, SoundCloud, Facebook e Instagram exponen iframes
  // públicos. TikTok NO se embebe (son tarjetas propias con botón "Ver en
  // TikTok"). Cada dominio debe estar acá o el navegador bloquea el iframe
  // con el cartel "Este contenido está bloqueado".
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://w.soundcloud.com https://www.facebook.com https://web.facebook.com https://www.instagram.com https://instagram.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nadie puede meter la app dentro de un iframe ajeno (anti-clickjacking).
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  // 2 años de HTTPS forzado, incluyendo subdominios.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara/micrófono/geolocalización desde el navegador.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig

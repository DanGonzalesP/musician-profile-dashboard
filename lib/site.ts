// Datos de identidad del sitio usados por las páginas legales y metadatos.
// ⚠️ Antes de lanzar al público: reemplaza LEGAL_CONTACT_EMAIL por un correo
// real que revises (notificaciones de derechos de autor, privacidad, soporte)
// y LEGAL_JURISDICTION si operas desde otro país.

export const SITE_NAME = "Vibe"

// URL canónica del sitio. Next.js la necesita para resolver a absolutas las
// rutas relativas de los metadatos (Open Graph, canonical, sitemap): las
// redes sociales rechazan las relativas.
//
// En Vercel, NEXT_PUBLIC_SITE_URL debería apuntar al dominio definitivo. Si
// no está, se usa la URL que Vercel inyecta sola en cada despliegue, y en
// desarrollo el localhost.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "") ||
  "http://localhost:3000"
export const LEGAL_CONTACT_EMAIL = "danielgonzales200427@gmail.com"
export const LEGAL_LAST_UPDATE = "19 de julio de 2026"
export const LEGAL_JURISDICTION = "Perú";
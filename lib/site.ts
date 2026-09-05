// Datos de identidad del sitio usados por las páginas legales y metadatos.
// ⚠️ Antes de lanzar al público: reemplaza LEGAL_CONTACT_EMAIL por un correo
// real que revises (notificaciones de derechos de autor, privacidad, soporte)
// y LEGAL_JURISDICTION si operas desde otro país.

export const SITE_NAME = "Vibe"

// URL canónica del sitio. Next.js la necesita para resolver a absolutas las
// rutas relativas de los metadatos (Open Graph, canonical, sitemap): las
// redes sociales rechazan las relativas.
//
// `NEXT_PUBLIC_SITE_URL` debe apuntar al dominio definitivo. Se declara en
// `wrangler.jsonc` (ver la sección `vars`).
//
// El respaldo intermedio desapareció con la migración: en Vercel existía
// `NEXT_PUBLIC_VERCEL_URL`, que la plataforma inyectaba sola con la URL
// efímera de cada despliegue. **Cloudflare Workers no tiene equivalente** —la
// URL de vista previa se arma con el id de la versión, que no se conoce en
// tiempo de build—, así que inventar un respaldo aquí sólo produciría
// metadatos con un dominio equivocado, que es peor que no tenerlos.
//
// Queda entonces: la variable, o localhost. Si falta en producción, las
// tarjetas sociales apuntarían a localhost, y por eso el smoke la verifica.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
export const LEGAL_CONTACT_EMAIL = "danielgonzales200427@gmail.com"
export const LEGAL_LAST_UPDATE = "19 de julio de 2026"
export const LEGAL_JURISDICTION = "Perú";
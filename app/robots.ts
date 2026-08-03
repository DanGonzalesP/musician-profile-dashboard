import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// Le dice a los buscadores qué pueden indexar. Los perfiles públicos SÍ (son
// el producto); el panel del artista y las rutas de API, no.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/perfil/",
        "/grupo/",
        "/cleanup",
        "/login",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}

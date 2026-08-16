import type { MetadataRoute } from "next"
import { createServerSupabase } from "@/lib/supabase-server"
import { SITE_URL } from "@/lib/site"
import { logError } from "@/lib/log"

// Sitemap dinámico: lista los perfiles públicos para que Google los descubra
// sin tener que rastrear enlace por enlace. Se regenera cada hora.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/legal`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/terminos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/copyright`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/comunidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/cookies`, changeFrequency: "yearly", priority: 0.2 },
  ]

  try {
    const supabase = createServerSupabase()

    // Solo perfiles que de verdad tienen contenido publicado: un perfil vacío
    // indexado es una página de error para Google y perjudica al dominio.
    //
    // `is_suspended` se pide y se filtra en el código (P-34): un perfil
    // suspendido listado en el sitemap es una invitación a que Google lo
    // rastree justo después de haberlo bajado. Si la columna no estuviera
    // disponible, el `select` falla entero y se cae al `catch` de abajo, que
    // sirve las rutas estáticas — nunca perfiles sin filtrar.
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("username, is_suspended, profile_blocks!inner(id)")
      .not("username", "is", null)
      .limit(5000)

    const vistos = new Set<string>()
    const dinamicas: MetadataRoute.Sitemap = []

    for (const fila of perfiles ?? []) {
      const { username, is_suspended: suspendido } = fila as { username?: string; is_suspended?: boolean }
      if (!username || vistos.has(username) || suspendido === true) continue
      vistos.add(username)

      dinamicas.push({
        url: `${SITE_URL}/${username}`,
        changeFrequency: "weekly",
        priority: 0.8,
      })
    }

    return [...estaticas, ...dinamicas]
  } catch (error) {
    // Un sitemap parcial es mucho mejor que un 500: si Supabase no responde,
    // se sirven al menos las rutas estáticas.
    logError("sitemap", "no se pudieron listar los perfiles", error)
    return estaticas
  }
}

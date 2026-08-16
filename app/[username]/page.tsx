import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { fetchProfileMeta, fetchPublicProfilePage } from "@/lib/supabase-server"
import { SITE_NAME } from "@/lib/site"
import { PerfilPublicoClient } from "./profile-client"

// Server Component: existe para darle al perfil público lo que un Client
// Component no puede dar.
//
// Antes esta página era 100% cliente, con los datos cargados en un useEffect.
// Para un producto cuyo valor ES el perfil compartible, eso costaba caro:
//   • Google indexaba un esqueleto vacío — buscar el nombre de un artista no
//     encontraba su página de Vibe.
//   • Pegar el enlace en WhatsApp o Instagram no mostraba ni foto ni nombre:
//     salía el mismo título genérico para todos los perfiles.
//
// Ahora los metadatos se resuelven en el servidor (título, descripción e
// imagen reales del artista) y la parte interactiva sigue en el cliente.

// Se revalida cada 5 minutos: los perfiles cambian poco y así la mayoría de
// las visitas no golpean Supabase.
export const revalidate = 300

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await fetchProfileMeta(username)

  if (!profile) {
    return {
      title: `Artista no encontrado — ${SITE_NAME}`,
      robots: { index: false, follow: false },
    }
  }

  const esGrupo = profile.profileType === "band"
  const titulo = `${profile.displayName} — ${esGrupo ? "Grupo musical" : "Músico"} en ${SITE_NAME}`

  // La descripción prioriza lo que escribió el artista; si no hay nada, se
  // arma una honesta con lo que sí se sabe, sin inventar.
  const descripcion =
    profile.bio?.trim() ||
    profile.tagline?.trim() ||
    [
      `Escucha la música de ${profile.displayName}`,
      profile.location ? `desde ${profile.location}` : null,
      `en ${SITE_NAME}.`,
    ]
      .filter(Boolean)
      .join(" ")

  const imagen = profile.banner || profile.image
  const url = `/${profile.username}`

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title: titulo,
      description: descripcion,
      url,
      siteName: SITE_NAME,
      images: imagen ? [{ url: imagen, alt: profile.displayName }] : undefined,
      locale: "es_PE",
    },
    twitter: {
      card: imagen ? "summary_large_image" : "summary",
      title: titulo,
      description: descripcion,
      images: imagen ? [imagen] : undefined,
    },
  }
}

export default async function PerfilPublicoPage({ params }: Props) {
  const { username } = await params
  const resultado = await fetchPublicProfilePage(username)

  // Username antiguo: se redirige al actual, igual que hacía el cliente, pero
  // ahora con un 307 real en vez de un router.replace() después de pintar.
  if (resultado.estado === "redirigir") redirect(`/${resultado.username}`)

  // No existe, o está suspendido. Para el visitante son lo mismo: una página
  // que no está. Antes esto era un 200 con el texto "Artista no encontrado"
  // (un soft 404 que Google indexa igual); ahora es un 404 de verdad.
  if (resultado.estado === "no-encontrado") notFound()

  // `sin-servidor`: Supabase no respondió en el servidor. No se convierte un
  // corte transitorio en un 404 cacheado — se cae al comportamiento de
  // siempre y el navegador carga el perfil como lo hacía antes de F10.
  if (resultado.estado === "sin-servidor") return <PerfilPublicoClient />

  return <PerfilPublicoClient datosIniciales={resultado.datos} />
}

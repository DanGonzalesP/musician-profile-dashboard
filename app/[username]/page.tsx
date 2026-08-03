import type { Metadata } from "next"
import { fetchProfileMeta } from "@/lib/supabase-server"
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

export default function PerfilPublicoPage() {
  return <PerfilPublicoClient />
}

import type { Metadata } from "next"
import { fetchProfileMeta } from "@/lib/supabase-server"
import { SITE_NAME } from "@/lib/site"
import { TiendaClient } from "./tienda-client"

// Mismo criterio que el perfil público: los metadatos se resuelven en el
// servidor para que la tienda de un artista sea indexable y se vea bien al
// compartirla. Ver app/[username]/page.tsx.

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

  const titulo = `Tienda y servicios de ${profile.displayName} — ${SITE_NAME}`
  const descripcion = `Productos, merch y servicios profesionales que ofrece ${profile.displayName} en ${SITE_NAME}.`
  const imagen = profile.banner || profile.image

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/${profile.username}/tienda` },
    openGraph: {
      type: "website",
      title: titulo,
      description: descripcion,
      url: `/${profile.username}/tienda`,
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

export default function TiendaPage() {
  return <TiendaClient />
}

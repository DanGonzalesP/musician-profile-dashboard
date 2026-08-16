import { ImageResponse } from "next/og"
import { fetchProfileMeta } from "@/lib/supabase-server"
import { fotoSocialPermitida } from "@/lib/imagen-social"
import { SITE_NAME } from "@/lib/site"

// Tarjeta social por perfil (P-19).
//
// Antes, la imagen de Open Graph era la foto del artista tal cual estaba en R2.
// Eso tenía dos problemas: si el artista no había subido foto, el enlace se
// compartía SIN imagen (en WhatsApp e Instagram eso es un enlace muerto), y
// cuando sí había foto, se compartía recortada a lo que decidiera cada red.
//
// Ahora siempre hay tarjeta: se compone acá, con el nombre del artista, su
// lema y su ubicación sobre el fondo oscuro de la marca. Si tiene foto, se usa
// de fondo; si no, la composición sola ya es una tarjeta digna.
//
// La generación es cacheada por Next junto con la ruta, así que no se paga una
// composición por cada vez que alguien pega el enlace.

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Tarjeta del perfil"

// SEGURIDAD — el fondo de la tarjeta lo DESCARGA el servidor al componerla, y
// la URL sale del JSONB del hero, que lo escribe el artista. Sin filtro esta
// ruta es un SSRF. El criterio (origen exacto del bucket, sólo https,
// fail-closed sin bucket configurado) vive en lib/imagen-social.ts, probado.
function fotoPermitida(url: string | undefined): string | undefined {
  return fotoSocialPermitida(url, process.env.NEXT_PUBLIC_R2_PUBLIC_URL)
}

type Props = { params: Promise<{ username: string }> }

export default async function Image({ params }: Props) {
  const { username } = await params
  const perfil = await fetchProfileMeta(username)

  const nombre = perfil?.displayName || username
  const lema = perfil?.tagline?.trim() || perfil?.bio?.trim() || ""
  const ubicacion = perfil?.location?.trim() || ""
  const foto = fotoPermitida(perfil?.banner) ?? fotoPermitida(perfil?.image)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          // El mismo negro del producto, para que la tarjeta se reconozca
          // como de Vibe antes de leer nada.
          background: "#0a0a0a",
          color: "#fafafa",
          padding: 72,
          position: "relative",
        }}
      >
        {foto ? (
          // `img` y no `next/image`: ImageResponse compone la imagen en el
          // servidor con Satori, que sólo entiende HTML básico.
          <img
            src={foto}
            alt=""
            width={1200}
            height={630}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }}
          />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          <div style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#e11d48" }}>
            {SITE_NAME}
          </div>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>{nombre}</div>
          {lema ? (
            <div style={{ fontSize: 36, color: "#d4d4d8", maxWidth: 980 }}>{lema.slice(0, 120)}</div>
          ) : null}
          {ubicacion ? <div style={{ fontSize: 30, color: "#a1a1aa" }}>{ubicacion}</div> : null}
        </div>
      </div>
    ),
    size
  )
}

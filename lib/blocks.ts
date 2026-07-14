import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap, Heart } from "lucide-react"

export const PROFILE_ID = "00000000-0000-0000-0000-000000000000"

export type BlockType = "hero" | "tracks" | "merch" | "service" | "donation"

export type SocialPlatform = "instagram" | "youtube" | "twitter" | "spotify" | "bandcamp"

export type SocialLink = {
  platform: SocialPlatform
  label: string
  href: string
}

export type Track = {
  title: string
  duration: string
  audioUrl?: string
  description?: string
  image?: string
  // Huella SHA-256 del archivo de audio, calculada en el navegador al
  // subirlo — sirve de base para el certificado de autoría (marcado de tiempo).
  fileHash?: string
}

export type Album = {
  id: string
  title: string
  cover: string
  tracks: Track[]
  isExample?: boolean
}

export type HeroData = {
  name: string
  tagline: string
  location: string
  image: string
  banner?: string
  monthlyListeners?: string
  socials?: SocialLink[]
}

export type TracksData = {
  albums: Album[]
}

export type MerchData = {
  title: string
}

export type ServiceData = {
  title: string
}

export type DonationData = {
  title: string
  description: string
  buttonText: string
  goalAmount: string
  currency: string
  // Monto acumulado y fecha límite de la campaña de apoyo (estilo Kickstarter).
  currentAmount: string
  deadline: string
}

export type LicenseSongOption = { id: string; label: string }

/**
 * Aplana los álbumes/pistas del bloque "tracks" en opciones seleccionables
 * para el formulario de licencias (herramienta interna, no un bloque de
 * página) — se recalcula desde los bloques actuales, nunca se guarda una
 * copia aparte.
 */
export function getSongOptions(tracksData: TracksData | undefined): LicenseSongOption[] {
  if (!tracksData) return []
  return tracksData.albums.flatMap((album) =>
    album.tracks.map((track, i) => ({
      id: `${album.id}-${i}`,
      label: track.title ? `${album.title || "Sin título"} — ${track.title}` : `${album.title || "Sin título"} — Pista ${i + 1}`,
    }))
  )
}

export type BlockData = HeroData | TracksData | MerchData | ServiceData | DonationData

export type Block = {
  id: string
  type: BlockType
  data: BlockData
}

export type BlockDefinition = {
  type: BlockType
  label: string
  description: string
  icon: LucideIcon
  category: "Layout" | "Music" | "Commerce"
}

export const BLOCK_LIBRARY: BlockDefinition[] = [
  {
    type: "hero",
    label: "Banner Principal",
    description: "Encabezado grande con tu nombre, frase de presentación y foto.",
    icon: GalleryVerticalEnd,
    category: "Layout",
  },
  {
    type: "tracks",
    label: "Lista de Canciones",
    description: "Lista reproducible de canciones con mini reproductor.",
    icon: ListMusic,
    category: "Music",
  },
  {
    type: "merch",
    label: "Tienda de Merch",
    description: "Vende vinilos, instrumentos y productos físicos.",
    icon: Store,
    category: "Commerce",
  },
  {
    type: "service",
    label: "Servicios",
    description: "Ofrece clases, sesiones y reservas.",
    icon: GraduationCap,
    category: "Commerce",
  },
  {
    type: "donation",
    label: "Campaña de Apoyo",
    description: "Deja que tus fans te apoyen directamente con un botón de aportes.",
    icon: Heart,
    category: "Commerce",
  },
]

const KNOWN_BLOCK_TYPES = BLOCK_LIBRARY.map((b) => b.type)

/**
 * Filtra block_type que ya no existen en BLOCK_LIBRARY (ej. "license", del
 * bloque de licencia express que se removió del editor) — filas que quedaron
 * huérfanas en profile_blocks/draft_content de antes de ese cambio. Sin este
 * filtro, normalizeBlockData no las reconoce y devuelve `data: undefined`,
 * lo que rompe cualquier código que recorra las propiedades del bloque
 * (ej. el escaneo de blob URLs al publicar).
 */
export function isKnownBlockType(type: string): type is BlockType {
  return (KNOWN_BLOCK_TYPES as string[]).includes(type)
}

export function createBlock(type: BlockType): Block {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    data: defaultData(type),
  }
}

type DbProfileBlock = {
  id: number
  block_type: string
  content: unknown
}

export function normalizeBlockData(type: BlockType, raw: unknown): BlockData {
  const content = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  switch (type) {
    case "hero":
      return {
        name: String(content.name ?? ""),
        tagline: String(content.tagline ?? ""),
        location: String(content.location ?? ""),
        image: String(content.image ?? content.avatarUrl ?? content.coverUrl ?? "/hero-banner.png"),
        banner: content.banner ? String(content.banner) : "",
        monthlyListeners: content.monthlyListeners ? String(content.monthlyListeners) : "",
        socials: Array.isArray(content.socials) ? content.socials.map(normalizeSocialLink) : [],
      }
    case "tracks": {
      if (Array.isArray(content.albums)) {
        return { albums: content.albums.map((a, i) => normalizeAlbum(a, i)) }
      }
      // Retrocompatibilidad: bloques guardados antes de que existieran múltiples
      // álbumes (una sola portada + lista plana de tracks) se envuelven en un
      // único álbum para no perder el contenido ya publicado.
      if (Array.isArray(content.tracks) || content.cover || content.title) {
        return {
          albums: [
            normalizeAlbum(
              { id: "album-1", title: content.title, cover: content.cover, tracks: content.tracks },
              0
            ),
          ],
        }
      }
      return { albums: [] }
    }
    case "merch":
      return {
        title: String(content.title ?? ""),
      }
    case "service":
      return {
        title: String(content.title ?? ""),
      }
    case "donation":
      return {
        title: String(content.title ?? ""),
        description: String(content.description ?? ""),
        buttonText: String(content.buttonText ?? "Apoyar"),
        goalAmount: String(content.goalAmount ?? ""),
        currency: String(content.currency ?? "USD"),
        currentAmount: String(content.currentAmount ?? "0"),
        deadline: content.deadline ? String(content.deadline) : "",
      }
  }
}

function normalizeSocialLink(raw: unknown): SocialLink {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const validPlatforms: SocialPlatform[] = ["instagram", "youtube", "twitter", "spotify", "bandcamp"]
  const platform = validPlatforms.includes(s.platform as SocialPlatform) ? (s.platform as SocialPlatform) : "instagram"
  return {
    platform,
    label: String(s.label ?? ""),
    href: String(s.href ?? ""),
  }
}

function normalizeTrack(raw: unknown): Track {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    title: String(t.title ?? ""),
    duration: String(t.duration ?? ""),
    audioUrl: t.audioUrl ? String(t.audioUrl) : undefined,
    description: t.description ? String(t.description) : undefined,
    image: t.image ? String(t.image) : undefined,
    fileHash: t.fileHash ? String(t.fileHash) : undefined,
  }
}

function normalizeAlbum(raw: unknown, index: number): Album {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(a.id ?? `album-${index + 1}`),
    title: String(a.title ?? ""),
    cover: String(a.cover ?? "/album-1.png"),
    tracks: Array.isArray(a.tracks) ? a.tracks.map(normalizeTrack) : [],
    isExample: Boolean(a.isExample),
  }
}

export function dbBlockToBlock(dbBlock: DbProfileBlock): Block {
  const type = dbBlock.block_type as BlockType
  return {
    id: `${type}-${dbBlock.id}`,
    type,
    data: normalizeBlockData(type, dbBlock.content),
  }
}

function defaultData(type: BlockType): BlockData {
  switch (type) {
    case "hero":
      return {
        name: "Nova Reyes",
        tagline: "Analog dreamer making late-night synth pop.",
        location: "Lisbon, PT",
        image: "/hero-banner.png",
        banner: "",
        monthlyListeners: "",
        socials: [],
      }
    case "tracks":
      return {
        // Nota: las duraciones se dejan vacías a propósito — el editor las calcula
        // solo, leyendo la metadata real del audio, nunca son números inventados.
        albums: [
          {
            id: "album-1",
            title: "Digital Ethereal",
            cover: "/album-1.png",
            isExample: true,
            tracks: [
              {
                title: "Neon Horizon",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                description:
                  "Ejemplo de descripción: cuenta aquí en qué te inspiraste para esta canción — un lugar, una persona, una noche en particular. Este texto aparece mientras el fan la está escuchando. Reemplázalo por la historia real de tu pista.",
              },
              {
                title: "Silica Waves",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
                description:
                  "Otro ejemplo de descripción por pista: cada canción del álbum puede tener su propio texto, distinto al de las demás.",
              },
              {
                title: "Fractal Dream",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
                description: "Descripción de ejemplo — bórrala y escribe la tuya desde el editor.",
              },
            ],
          },
          {
            id: "album-2",
            title: "Analog Sessions",
            cover: "/album-1.png",
            isExample: true,
            tracks: [
              {
                title: "Velocity Zero",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
                description: "Este es un segundo álbum de ejemplo: el carrusel puede mostrar tantos álbumes como quieras.",
              },
              {
                title: "Prism Shift",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
                description: "Sube tu propio audio en el editor y esta pista de muestra desaparecerá.",
              },
            ],
          },
          {
            id: "album-3",
            title: "Midnight Frequencies",
            cover: "/album-1.png",
            isExample: true,
            tracks: [
              {
                title: "Static Bloom",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
                description: "Un tercer álbum de ejemplo, para ver cómo se ve el carrusel con varias portadas.",
              },
              {
                title: "Afterglow",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
                description: "Cada álbum puede tener el número de canciones que quieras.",
              },
              {
                title: "Low Tide",
                duration: "",
                audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
                description: "Descripción de ejemplo — reemplázala por la historia real de tu canción.",
              },
            ],
          },
        ],
      }
    case "merch":
      return {
        title: "Merch & Instruments",
      }
    case "service":
      return {
        title: "Lessons & Sessions",
      }
    case "donation":
      return {
        title: "Apoya Mi Música",
        description: "Cada aporte me ayuda a crear más música, girar y conectar con fans como tú.",
        buttonText: "Apoyar",
        goalAmount: "1000",
        currency: "USD",
        currentAmount: "0",
        deadline: "",
      }
  }
}

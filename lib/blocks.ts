import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap, Heart, Disc3, Rocket, Library } from "lucide-react"

export const PROFILE_ID = "00000000-0000-0000-0000-000000000000"

export type BlockType = "hero" | "single" | "crowdfunding" | "tracks" | "catalog" | "merch" | "service" | "donation"

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

export type ReleaseType = "album" | "ep" | "single"

export type Album = {
  id: string
  title: string
  cover: string
  tracks: Track[]
  isExample?: boolean
  // Campos usados por el bloque "catalog" (Bloque 3, carrusel de
  // Álbumes/EPs/Singles) — quedan opcionales porque el bloque "tracks" ya
  // existente sigue guardando Album sin ellos y no los necesita para nada.
  // Un item "single" siempre trae exactamente 1 track en `tracks`.
  releaseType?: ReleaseType
  genre?: string
  year?: string
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

export type CatalogData = {
  albums: Album[]
}

export type SingleData = {
  title: string
  genre: string
  year: string
  description?: string
  cover: string
  audioUrl?: string
  // Igual que Track.duration: nunca es un número inventado, se calcula
  // leyendo la metadata real del audio al subirlo.
  duration: string
}

export type CrowdfundingData = {
  title: string
  description: string
  targetAmount: string
  // currentAmount, backerCount y hypeCount son bases de referencia: el fan
  // ve el total sumando sus propias interacciones de la sesión encima de
  // esta base, pero esos incrementos nunca se guardan (misma simulación sin
  // pasarela real que ya usa DonationData.currentAmount).
  currentAmount: string
  daysLeft: string
  chosenStudio: string
  hypeCount: string
  backerCount: string
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

export type BlockData =
  | HeroData
  | SingleData
  | CrowdfundingData
  | TracksData
  | CatalogData
  | MerchData
  | ServiceData
  | DonationData

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
    type: "single",
    label: "Lanzamiento Actual",
    description: "El single o canción destacada que se muestra al tope de tu perfil.",
    icon: Disc3,
    category: "Music",
  },
  {
    type: "crowdfunding",
    label: "Meta de Producción",
    description: "Campaña de recaudación estilo Kickstarter para financiar tu próxima grabación.",
    icon: Rocket,
    category: "Commerce",
  },
  {
    type: "tracks",
    label: "Lista de Canciones",
    description: "Lista reproducible de canciones con mini reproductor.",
    icon: ListMusic,
    category: "Music",
  },
  {
    type: "catalog",
    label: "Catálogo de Lanzamientos",
    description: "Carrusel horizontal con tus álbumes, EPs y singles anteriores.",
    icon: Library,
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
    case "catalog":
      return { albums: Array.isArray(content.albums) ? content.albums.map((a, i) => normalizeAlbum(a, i)) : [] }
    case "single":
      return {
        title: String(content.title ?? ""),
        genre: String(content.genre ?? ""),
        year: String(content.year ?? ""),
        description: content.description ? String(content.description) : "",
        cover: String(content.cover ?? ""),
        audioUrl: content.audioUrl ? String(content.audioUrl) : undefined,
        duration: String(content.duration ?? ""),
      }
    case "crowdfunding":
      return {
        title: String(content.title ?? ""),
        description: String(content.description ?? ""),
        targetAmount: String(content.targetAmount ?? ""),
        currentAmount: String(content.currentAmount ?? "0"),
        daysLeft: String(content.daysLeft ?? ""),
        chosenStudio: String(content.chosenStudio ?? ""),
        hypeCount: String(content.hypeCount ?? "0"),
        backerCount: String(content.backerCount ?? "0"),
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

const RELEASE_TYPES: ReleaseType[] = ["album", "ep", "single"]

function normalizeAlbum(raw: unknown, index: number): Album {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(a.id ?? `album-${index + 1}`),
    title: String(a.title ?? ""),
    cover: String(a.cover ?? "/album-1.png"),
    tracks: Array.isArray(a.tracks) ? a.tracks.map(normalizeTrack) : [],
    isExample: Boolean(a.isExample),
    releaseType: RELEASE_TYPES.includes(a.releaseType as ReleaseType) ? (a.releaseType as ReleaseType) : "album",
    genre: String(a.genre ?? ""),
    year: String(a.year ?? ""),
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
    case "catalog":
      // Sin álbumes de ejemplo a propósito, igual que "single" y
      // "crowdfunding" — el carrusel público debe quedar vacío hasta que el
      // artista cargue su catálogo real.
      return { albums: [] }
    case "crowdfunding":
      return {
        title: "",
        description: "",
        targetAmount: "",
        currentAmount: "0",
        daysLeft: "",
        chosenStudio: "",
        hypeCount: "0",
        backerCount: "0",
      }
    case "single":
      // Sin título, portada ni audio de ejemplo a propósito: hasta que el
      // artista suba su single, el bloque público debe mostrar el estado
      // "Próximo Lanzamiento", nunca música de prueba.
      return {
        title: "",
        genre: "",
        year: "",
        description: "",
        cover: "",
        audioUrl: undefined,
        duration: "",
      }
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
                description:
                  "Ejemplo de descripción: cuenta aquí en qué te inspiraste para esta canción — un lugar, una persona, una noche en particular. Este texto aparece mientras el fan la está escuchando. Reemplázalo por la historia real de tu pista.",
              },
              {
                title: "Silica Waves",
                duration: "",
                description:
                  "Otro ejemplo de descripción por pista: cada canción del álbum puede tener su propio texto, distinto al de las demás.",
              },
              {
                title: "Fractal Dream",
                duration: "",
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
                description: "Este es un segundo álbum de ejemplo: el carrusel puede mostrar tantos álbumes como quieras.",
              },
              {
                title: "Prism Shift",
                duration: "",
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
                description: "Un tercer álbum de ejemplo, para ver cómo se ve el carrusel con varias portadas.",
              },
              {
                title: "Afterglow",
                duration: "",
                description: "Cada álbum puede tener el número de canciones que quieras.",
              },
              {
                title: "Low Tide",
                duration: "",
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

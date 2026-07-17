import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap, Heart, Disc3, Rocket, Library, Users, Sparkles, GalleryHorizontalEnd, Video } from "lucide-react"

export const PROFILE_ID = "00000000-0000-0000-0000-000000000000"

export type BlockType =
  | "hero"
  | "single"
  | "crowdfunding"
  | "tracks"
  | "catalog"
  | "credits"
  | "merch"
  | "service"
  | "donation"
  | "legado"
  | "publicaciones"
  | "embeds"

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
  contactUrl?: string
  contactLabel?: string
}

export type TracksData = {
  albums: Album[]
}

export type CatalogData = {
  albums: Album[]
}

export type CreditRole = "A" | "C" | "P" | "R" | "M" | "V" | "I"

// "internal": colaboración en una canción de otro artista de la plataforma —
// requiere que el dueño de la canción la apruebe desde su panel de
// notificaciones antes de aparecer en el perfil público (ver
// lib/credit-requests.ts). "external": enlace de YouTube ajeno a la
// plataforma, se publica de inmediato sin aprobación.
export type CreditSourceType = "internal" | "external"
export type CreditStatus = "pending" | "accepted" | "rejected"

export type CreditItem = {
  id: string
  sourceType: CreditSourceType
  title: string
  mainArtist: string
  role: CreditRole
  // URL de YouTube — solo aplica cuando sourceType es "external".
  externalUrl?: string
  // "external" siempre queda "accepted" (no requiere aprobación de nadie).
  // "internal" nace "pending" y solo el dueño de la canción puede pasarlo a
  // "accepted"/"rejected" — ver resolveCreditRequest en lib/credit-requests.ts.
  status: CreditStatus
  // Solo para sourceType "internal": enlazan este crédito con la fila de
  // credit_requests que activa el flujo de notificaciones.
  requestId?: string
  ownerProfileId?: string
  songKey?: string
}

export type CreditsData = {
  credits: CreditItem[]
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

// ─── Bloque "legado" — trayectoria del artista (reemplaza al "CV" genérico) ─
// Presentacional: la bio larga, hitos de carrera (tarjetas 3D tilt),
// integrantes de banda (flip cards, vacío si es solista) e imágenes de
// referencia (fotos de prensa/shows). No tiene límite estricto de "tier
// gratuito" como Publicaciones — es contenido de portafolio/CV, no un feed.

export type LegadoMilestone = {
  id: string
  year: string
  title: string
  description: string
  image?: string
}

export type LegadoMember = {
  id: string
  name: string
  role: string
  photo?: string
  bio?: string
}

export type LegadoData = {
  headline: string
  bio: string
  genres: string[]
  influences: string[]
  timeline: LegadoMilestone[]
  members: LegadoMember[]
  gallery: string[]
}

// ─── Bloque "publicaciones" — galería de fotos/videos, tier gratuito ───────
// PUBLICACIONES_MAX_ITEMS es el límite duro de la versión gratuita (el
// artista elige sus mejores elementos). Un futuro tier pago solo necesita
// subir esta constante — no hay lógica de límite hardcodeada en otro lado.

export const PUBLICACIONES_MAX_ITEMS = 9

export type PublicacionItem = {
  id: string
  type: "image" | "video"
  url: string
  // Miniatura del video — si no se sube una propia, el bloque público debe
  // resolver un frame o mostrar un ícono de reproducción sobre fondo sólido.
  thumbnail?: string
  caption?: string
}

export type PublicacionesData = {
  items: PublicacionItem[]
}

// ─── Bloque "embeds" — YouTube (iframe real, puede traer anuncios) y
// TikTok (tarjeta propia con miniatura opcional subida por el artista +
// botón "Ver en TikTok", sin script embed.tiktok.com de terceros) ──────────

export type EmbedPlatform = "youtube" | "tiktok"

export type EmbedItem = {
  id: string
  platform: EmbedPlatform
  url: string
  title?: string
  // Solo se usa para "tiktok" — TikTok no se embebe en vivo, así que la
  // miniatura de la tarjeta la sube el propio artista (mismo ImageUploader
  // que el resto del editor).
  thumbnail?: string
}

export type EmbedsData = {
  items: EmbedItem[]
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
  | CreditsData
  | MerchData
  | ServiceData
  | DonationData
  | LegadoData
  | PublicacionesData
  | EmbedsData

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
  category: "Layout" | "Music" | "Perfil" | "Commerce"
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
    type: "credits",
    label: "Créditos y Colaboraciones",
    description: "Canciones de otros artistas en las que participaste, con tu rol exacto.",
    icon: Users,
    category: "Music",
  },
  {
    type: "legado",
    label: "Trayectoria",
    description: "Tu historia, trayectoria e integrantes — el CV de un músico, sin verse como uno.",
    icon: Sparkles,
    category: "Perfil",
  },
  {
    type: "publicaciones",
    label: "Publicaciones",
    description: "Hasta 9 fotos y videos, tus mejores momentos.",
    icon: GalleryHorizontalEnd,
    category: "Perfil",
  },
  {
    type: "embeds",
    label: "Embeds",
    description: "Enlaces de YouTube y TikTok que ya publicaste en otras plataformas.",
    icon: Video,
    category: "Perfil",
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
        contactUrl: content.contactUrl ? String(content.contactUrl) : "",
        contactLabel: content.contactLabel ? String(content.contactLabel) : "",
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
    case "credits":
      return { credits: Array.isArray(content.credits) ? content.credits.map((c, i) => normalizeCreditItem(c, i)) : [] }
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
    case "legado":
      return {
        headline: String(content.headline ?? ""),
        bio: String(content.bio ?? ""),
        genres: Array.isArray(content.genres) ? content.genres.map(String) : [],
        influences: Array.isArray(content.influences) ? content.influences.map(String) : [],
        timeline: Array.isArray(content.timeline) ? content.timeline.map((m, i) => normalizeLegadoMilestone(m, i)) : [],
        members: Array.isArray(content.members) ? content.members.map((m, i) => normalizeLegadoMember(m, i)) : [],
        gallery: Array.isArray(content.gallery) ? content.gallery.map(String) : [],
      }
    case "publicaciones":
      return {
        items: Array.isArray(content.items)
          ? content.items.map((p, i) => normalizePublicacionItem(p, i)).slice(0, PUBLICACIONES_MAX_ITEMS)
          : [],
      }
    case "embeds":
      return {
        items: Array.isArray(content.items) ? content.items.map((e, i) => normalizeEmbedItem(e, i)) : [],
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

const CREDIT_ROLES: CreditRole[] = ["A", "C", "P", "R", "M", "V", "I"]

const CREDIT_STATUSES: CreditStatus[] = ["pending", "accepted", "rejected"]

function normalizeCreditItem(raw: unknown, index: number): CreditItem {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  // Créditos guardados antes de que existiera el flujo interno/externo caen
  // en "external" + "accepted" — se siguen mostrando igual que antes, sin
  // necesitar aprobación de nadie.
  const sourceType: CreditSourceType = c.sourceType === "internal" ? "internal" : "external"
  const status: CreditStatus = CREDIT_STATUSES.includes(c.status as CreditStatus) ? (c.status as CreditStatus) : "accepted"
  return {
    id: String(c.id ?? `credit-${index + 1}`),
    sourceType,
    title: String(c.title ?? ""),
    mainArtist: String(c.mainArtist ?? ""),
    role: CREDIT_ROLES.includes(c.role as CreditRole) ? (c.role as CreditRole) : "M",
    externalUrl: c.externalUrl ? String(c.externalUrl) : undefined,
    status,
    requestId: c.requestId ? String(c.requestId) : undefined,
    ownerProfileId: c.ownerProfileId ? String(c.ownerProfileId) : undefined,
    songKey: c.songKey ? String(c.songKey) : undefined,
  }
}

function normalizeLegadoMilestone(raw: unknown, index: number): LegadoMilestone {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(m.id ?? `milestone-${index + 1}`),
    year: String(m.year ?? ""),
    title: String(m.title ?? ""),
    description: String(m.description ?? ""),
    image: m.image ? String(m.image) : undefined,
  }
}

function normalizeLegadoMember(raw: unknown, index: number): LegadoMember {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(m.id ?? `member-${index + 1}`),
    name: String(m.name ?? ""),
    role: String(m.role ?? ""),
    photo: m.photo ? String(m.photo) : undefined,
    bio: m.bio ? String(m.bio) : undefined,
  }
}

const PUBLICACION_TYPES = ["image", "video"] as const

function normalizePublicacionItem(raw: unknown, index: number): PublicacionItem {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(p.id ?? `publicacion-${index + 1}`),
    type: PUBLICACION_TYPES.includes(p.type as (typeof PUBLICACION_TYPES)[number]) ? (p.type as "image" | "video") : "image",
    url: String(p.url ?? ""),
    thumbnail: p.thumbnail ? String(p.thumbnail) : undefined,
    caption: p.caption ? String(p.caption) : undefined,
  }
}

const EMBED_PLATFORMS: EmbedPlatform[] = ["youtube", "tiktok"]

function normalizeEmbedItem(raw: unknown, index: number): EmbedItem {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(e.id ?? `embed-${index + 1}`),
    platform: EMBED_PLATFORMS.includes(e.platform as EmbedPlatform) ? (e.platform as EmbedPlatform) : "youtube",
    url: String(e.url ?? ""),
    title: e.title ? String(e.title) : undefined,
    thumbnail: e.thumbnail ? String(e.thumbnail) : undefined,
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
    case "credits":
      return { credits: [] }
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
    case "legado":
      return {
        headline: "",
        bio: "",
        genres: [],
        influences: [],
        timeline: [],
        members: [],
        gallery: [],
      }
    case "publicaciones":
      return { items: [] }
    case "embeds":
      return { items: [] }
  }
}

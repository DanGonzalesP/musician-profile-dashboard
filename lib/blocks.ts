import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap, Heart } from "lucide-react"

export const PROFILE_ID = "00000000-0000-0000-0000-000000000000"

export type BlockType = "hero" | "tracks" | "merch" | "service" | "donation"

export type Track = {
  title: string
  duration: string
  audioUrl?: string
}

export type HeroData = {
  name: string
  tagline: string
  location: string
  image: string
}

export type TracksData = {
  title: string
  cover: string
  tracks: Track[]
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
  buttonUrl: string
  goalAmount: string
  currency: string
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
    label: "Hero Banner",
    description: "Big header with your name, tagline and photo.",
    icon: GalleryVerticalEnd,
    category: "Layout",
  },
  {
    type: "tracks",
    label: "Track List",
    description: "Playable list of songs with a mini music player.",
    icon: ListMusic,
    category: "Music",
  },
  {
    type: "merch",
    label: "Merch Grid",
    description: "Sell vinyls, instruments and physical goods.",
    icon: Store,
    category: "Commerce",
  },
  {
    type: "service",
    label: "Service Offer",
    description: "Offer lessons, sessions and bookings.",
    icon: GraduationCap,
    category: "Commerce",
  },
  {
    type: "donation",
    label: "Donation Panel",
    description: "Let fans support you directly with a donation button.",
    icon: Heart,
    category: "Commerce",
  },
]

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
      }
    case "tracks":
      return {
        title: String(content.title ?? ""),
        cover: String(content.cover ?? "/album-1.png"),
        tracks: Array.isArray(content.tracks)
          ? content.tracks.map((t) => {
              const track = (t && typeof t === "object" ? t : {}) as Record<string, unknown>
              return {
                title: String(track.title ?? ""),
                duration: String(track.duration ?? ""),
                audioUrl: track.audioUrl ? String(track.audioUrl) : undefined,
              }
            })
          : [],
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
        buttonUrl: String(content.buttonUrl ?? ""),
        goalAmount: String(content.goalAmount ?? ""),
        currency: String(content.currency ?? "USD"),
      }
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
      }
    case "tracks":
      return {
        title: "Latest Release — Digital Ethereal",
        cover: "/album-1.png",
        tracks: [
          { title: "Neon Horizon", duration: "3:42" },
          { title: "Silica Waves", duration: "4:15" },
          { title: "Fractal Dream", duration: "3:58" },
          { title: "Velocity Zero", duration: "5:10" },
          { title: "Prism Shift", duration: "2:45" },
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
        title: "Support My Music",
        description: "Every contribution helps me create more music, tour, and connect with fans like you.",
        buttonText: "Support Now",
        buttonUrl: "",
        goalAmount: "",
        currency: "USD",
      }
  }
}

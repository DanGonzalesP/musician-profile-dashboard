import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap } from "lucide-react"

export const PROFILE_ID = "00000000-0000-0000-0000-000000000000"

export type BlockType = "hero" | "tracks" | "merch" | "service"

export type Track = {
  title: string
  duration: string
}

export type Product = {
  name: string
  price: string
  tag: string
  image: string
}

export type Service = {
  title: string
  price: string
  description: string
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
  products: Product[]
}

export type ServiceData = {
  title: string
  services: Service[]
}

export type BlockData = HeroData | TracksData | MerchData | ServiceData

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
              }
            })
          : [],
      }
    case "merch":
      return {
        title: String(content.title ?? ""),
        products: Array.isArray(content.products)
          ? content.products.map((p) => {
              const product = (p && typeof p === "object" ? p : {}) as Record<string, unknown>
              return {
                name: String(product.name ?? ""),
                price: String(product.price ?? ""),
                tag: String(product.tag ?? ""),
                image: String(product.image ?? ""),
              }
            })
          : [],
      }
    case "service":
      return {
        title: String(content.title ?? ""),
        services: Array.isArray(content.services)
          ? content.services.map((s) => {
              const service = (s && typeof s === "object" ? s : {}) as Record<string, unknown>
              return {
                title: String(service.title ?? ""),
                price: String(service.price ?? ""),
                description: String(service.description ?? ""),
              }
            })
          : [],
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
        products: [
          { name: "Digital Ethereal — Orange Vinyl", price: "$32", tag: "Limited", image: "/merch-vinyl.png" },
          { name: "Signature Electric Guitar", price: "$1,240", tag: "1 of 12", image: "/merch-guitar.png" },
        ],
      }
    case "service":
      return {
        title: "Lessons & Sessions",
        services: [
          { title: "1:1 Songwriting Lesson", price: "$60 / hr", description: "Live over video, all levels welcome." },
          { title: "Mixing & Mastering", price: "$180 / track", description: "Studio-grade polish for your record." },
          { title: "Session Guitarist", price: "From $250", description: "Remote or in-studio recording." },
        ],
      }
  }
}

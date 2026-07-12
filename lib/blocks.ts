import type { LucideIcon } from "lucide-react"
import { GalleryVerticalEnd, ListMusic, Store, GraduationCap } from "lucide-react"

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

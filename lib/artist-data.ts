export type SocialPlatform =
  | "instagram"
  | "youtube"
  | "twitter"
  | "spotify"
  | "bandcamp"

export type SocialLink = {
  platform: SocialPlatform
  label: string
  href: string
}

export type Track = {
  id: string
  title: string
  artwork: string
  /** duration in seconds */
  duration: number
  plays: number
}

export type Product = {
  id: string
  name: string
  category: string
  price: number
  image: string
  badge?: string
  soldOut?: boolean
}

export type LessonPlan = {
  id: string
  title: string
  description: string
  price: number
  cadence: string
  features: string[]
  highlighted?: boolean
}

export type HeroBlock = {
  type: "hero"
  name: string
  tagline: string
  location: string
  bio: string
  portrait: string
  banner: string
  socials: SocialLink[]
  monthlyListeners: string
}

export type TracksBlock = {
  type: "tracks"
  title: string
  subtitle?: string
  tracks: Track[]
}

export type MerchBlock = {
  type: "merch"
  title: string
  subtitle?: string
  products: Product[]
}

export type LessonsBlock = {
  type: "lessons"
  title: string
  subtitle?: string
  intro: string
  plans: LessonPlan[]
}

export type Block = HeroBlock | TracksBlock | MerchBlock | LessonsBlock

export type ArtistProfile = {
  handle: string
  blocks: Block[]
}

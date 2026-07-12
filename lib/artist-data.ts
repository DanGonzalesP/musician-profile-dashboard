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

export const artistProfile: ArtistProfile = {
  handle: "elenavance",
  blocks: [
    {
      type: "hero",
      name: "Elena Vance",
      tagline: "Singer-songwriter · Ambient folk",
      location: "Portland, OR",
      monthlyListeners: "48.2K monthly listeners",
      bio: "Elena Vance writes slow-burning folk songs stitched together with analog warmth and late-night honesty. Recorded to tape in a converted garage, her music lives somewhere between a whisper and a wildfire.",
      portrait: "/images/artist-portrait.png",
      banner: "/images/hero-banner.png",
      socials: [
        { platform: "instagram", label: "Instagram", href: "#" },
        { platform: "youtube", label: "YouTube", href: "#" },
        { platform: "twitter", label: "Twitter", href: "#" },
        { platform: "spotify", label: "Spotify", href: "#" },
        { platform: "bandcamp", label: "Bandcamp", href: "#" },
      ],
    },
    {
      type: "tracks",
      title: "Latest Tracks",
      subtitle: "Stream the newest singles and unreleased demos.",
      tracks: [
        {
          id: "t1",
          title: "Amber Hours",
          artwork: "/images/track-1.png",
          duration: 214,
          plays: 128400,
        },
        {
          id: "t2",
          title: "Neon in the Rain",
          artwork: "/images/track-2.png",
          duration: 187,
          plays: 96200,
        },
        {
          id: "t3",
          title: "Tape Machine Sunset",
          artwork: "/images/track-3.png",
          duration: 251,
          plays: 74800,
        },
        {
          id: "t4",
          title: "Particles",
          artwork: "/images/track-4.png",
          duration: 198,
          plays: 52100,
        },
      ],
    },
    {
      type: "merch",
      title: "Merch & Instruments",
      subtitle: "Limited runs, signed goods, and gear from the studio.",
      products: [
        {
          id: "p1",
          name: "Amber Hours — Limited Vinyl",
          category: "Vinyl · 180g",
          price: 32,
          image: "/images/merch-vinyl.png",
          badge: "Limited",
        },
        {
          id: "p2",
          name: "Tour Tee — Charcoal",
          category: "Apparel · Unisex",
          price: 28,
          image: "/images/merch-tshirt.png",
        },
        {
          id: "p3",
          name: "'68 Sunburst Acoustic",
          category: "Instrument · Signed",
          price: 1450,
          image: "/images/merch-guitar.png",
          badge: "1 of 1",
        },
        {
          id: "p4",
          name: "Warm Drive Boutique Pedal",
          category: "Gear · Handbuilt",
          price: 189,
          image: "/images/merch-pedal.png",
          soldOut: true,
        },
      ],
    },
    {
      type: "lessons",
      title: "Music Lessons",
      subtitle: "Learn songwriting, guitar, and home recording.",
      intro:
        "Book a one-on-one session and work through your own songs. All lessons are remote and beginner-friendly, with recordings sent afterward.",
      plans: [
        {
          id: "l1",
          title: "Single Session",
          description: "A focused 60-minute deep dive on one song or skill.",
          price: 65,
          cadence: "per session",
          features: [
            "60 minutes 1:1 over video",
            "Personalized practice notes",
            "Session recording included",
          ],
        },
        {
          id: "l2",
          title: "Monthly Mentorship",
          description: "Four weekly sessions with feedback between calls.",
          price: 220,
          cadence: "per month",
          highlighted: true,
          features: [
            "4 × 60 minute sessions",
            "Async song feedback anytime",
            "Custom practice roadmap",
            "Priority scheduling",
          ],
        },
      ],
    },
  ],
}

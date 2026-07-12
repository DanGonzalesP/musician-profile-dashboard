"use client"

import Image from "next/image"
import {
  AtSign,
  Camera,
  Disc3,
  MapPin,
  Music2,
  Share2,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HeroBlock, SocialPlatform } from "@/lib/artist-data"

type IconComponent = React.ComponentType<{ className?: string }>

const socialIcons: Record<SocialPlatform, IconComponent> = {
  instagram: Camera,
  youtube: Video,
  twitter: AtSign,
  spotify: Music2,
  bandcamp: Disc3,
}

export function HeroBanner({ block }: { block: HeroBlock }) {
  return (
    <header className="relative">
      {/* Banner image */}
      <div className="relative h-56 w-full overflow-hidden sm:h-72 md:h-80">
        <Image
          src={block.banner || "/placeholder.svg"}
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background from-35% via-background/75 to-transparent" />
      </div>

      {/* Content */}
      <div className="mx-auto -mt-20 max-w-5xl px-4 sm:-mt-24 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="relative size-32 shrink-0 overflow-hidden rounded-2xl border border-border shadow-2xl shadow-black/40 sm:size-40">
            <Image
              src={block.portrait || "/placeholder.svg"}
              alt={`${block.name} portrait`}
              fill
              priority
              className="object-cover"
            />
          </div>

          <div className="flex-1 pb-1">
            <p className="text-sm font-medium text-primary">{block.tagline}</p>
            <h1 className="mt-1 pb-1 font-display text-4xl font-bold leading-tight tracking-tight text-balance text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-5xl">
              {block.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {block.location}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span>{block.monthlyListeners}</span>
            </div>
          </div>
        </div>

        {/* Bio + actions */}
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {block.bio}
          </p>
          <Button
            variant="outline"
            size="lg"
            className="shrink-0 self-start"
          >
            <Share2 />
            Share profile
          </Button>
        </div>

        {/* Social links */}
        <nav
          aria-label="Social links"
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          {block.socials.map((social) => {
            const Icon = socialIcons[social.platform]
            return (
              <a
                key={social.platform}
                href={social.href}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Icon className="size-4" />
                {social.label}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}

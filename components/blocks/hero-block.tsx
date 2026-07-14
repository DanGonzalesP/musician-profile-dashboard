"use client"

import { useState } from "react"
import { MapPin, Camera, Video, AtSign, Music2, Disc3, Share2 } from "lucide-react"
import type { HeroData, SocialPlatform } from "@/lib/blocks"
import { ShareProfileDialog } from "./share-profile-dialog"

export const socialIcons: Record<SocialPlatform, typeof Camera> = {
  instagram: Camera,
  youtube: Video,
  twitter: AtSign,
  spotify: Music2,
  bandcamp: Disc3,
}

export function HeroBlock({
  data,
  shareUrl,
  albumCovers = [],
}: {
  data: HeroData
  shareUrl?: string
  albumCovers?: string[]
}) {
  const imagePreview = data.image || "/placeholder.svg"
  const socials = data.socials || []
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      {/* Banner de fondo — si no hay imagen, se usa un degradado suave con el color de acento */}
      <div className="relative h-36 w-full overflow-hidden sm:h-52">
        {data.banner ? (
          <img src={data.banner} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="relative -mt-12 px-6 pb-6 sm:-mt-16 sm:px-8 sm:pb-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-4 border-card shadow-2xl shadow-black/40 sm:size-32">
            <img src={imagePreview} alt={data.name || "Artist Name"} className="size-full object-cover" />
          </div>
          <div className="flex-1 pb-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
              {data.name || "Nombre del Artista"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground sm:justify-start">
              {data.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-primary" />
                  {data.location}
                </span>
              )}
              {data.monthlyListeners && (
                <>
                  {data.location && <span aria-hidden="true">·</span>}
                  <span>{data.monthlyListeners}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          {data.tagline && (
            <p className="max-w-2xl text-pretty text-center text-sm leading-relaxed text-muted-foreground sm:text-left sm:text-base">
              {data.tagline}
            </p>
          )}
          {shareUrl && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <Share2 className="size-4" />
              Compartir perfil
            </button>
          )}
        </div>

        {socials.length > 0 && (
          <nav
            aria-label="Social links"
            className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start"
          >
            {socials.map((social, i) => {
              const Icon = socialIcons[social.platform] ?? Music2
              return (
                <a
                  key={i}
                  href={social.href || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                  {social.label || social.platform}
                </a>
              )
            })}
          </nav>
        )}
      </div>

      {shareOpen && shareUrl && (
        <ShareProfileDialog
          shareUrl={shareUrl}
          data={data}
          albumCovers={albumCovers}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

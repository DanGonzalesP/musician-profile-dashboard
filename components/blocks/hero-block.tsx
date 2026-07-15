"use client"

import { useState } from "react"
import { MapPin, Camera, Video, AtSign, Music2, Disc3, Share2, Send } from "lucide-react"
import type { HeroData, SocialPlatform } from "@/lib/blocks"
import { ShareProfileDialog } from "./share-profile-dialog"
import { useLocale } from "@/components/locale-provider"

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
  creditsCount = 0,
}: {
  data: HeroData
  shareUrl?: string
  albumCovers?: string[]
  creditsCount?: number
}) {
  const { t } = useLocale()
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

      {/* Cabecera de 3 columnas en escritorio (bio | identidad | acciones),
          apiladas y centradas en móvil mediante `order-*`: foto → nombre/
          ubicación → métrica → bio → redes/botones. */}
      <div className="relative px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
          {/* Columna izquierda — Biografía corta */}
          <div className="order-2 flex justify-center sm:order-1 sm:justify-end">
            {data.tagline && (
              <p className="line-clamp-3 max-w-xs text-pretty text-center text-sm leading-relaxed text-muted-foreground sm:text-left">
                {data.tagline}
              </p>
            )}
          </div>

          {/* Columna central — Identidad principal */}
          <div className="order-1 flex flex-col items-center text-center sm:order-2">
            <div className="relative -mt-12 size-24 shrink-0 overflow-hidden rounded-full border-4 border-card shadow-2xl shadow-black/40 sm:-mt-16 sm:size-32">
              <img src={imagePreview} alt={data.name || t("hero_artist_name_fallback")} className="size-full object-cover" />
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
              {data.name || t("hero_artist_name_fallback")}
            </h2>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
            {creditsCount > 0 && (
              <span className="mt-2 inline-flex items-center rounded-full border border-primary/30 bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] px-2.5 py-0.5 text-xs font-medium text-primary">
                {creditsCount} {t(creditsCount === 1 ? "hero_credits_one" : "hero_credits_other")}
              </span>
            )}
          </div>

          {/* Columna derecha — Acciones y redes */}
          <div className="order-3 flex flex-col items-center gap-3 sm:items-end">
            {shareUrl && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <Share2 className="size-4" />
                {t("hero_share")}
              </button>
            )}

            {socials.length > 0 && (
              <nav aria-label={t("hero_social_aria")} className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
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

            {data.contactUrl && (
              <a
                href={data.contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("hero_contact_aria")}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary"
              >
                <Send className="size-4" />
                {data.contactLabel || t("hero_contact_fallback")}
              </a>
            )}
          </div>
        </div>
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

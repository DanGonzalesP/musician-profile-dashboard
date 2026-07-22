"use client"

import { useState, type ReactNode } from "react"
import { MapPin, Camera, Video, AtSign, Music2, Disc3, Share2 } from "lucide-react"
import type { HeroData, SocialPlatform } from "@/lib/blocks"
import { SOCIAL_PLATFORM_LABELS } from "@/lib/blocks"
import { resolveContactChannel, CONTACT_CHANNEL_ICONS, CONTACT_CHANNEL_LABELS } from "@/lib/contact-channel"
import { ShareProfileDialog } from "./share-profile-dialog"
import { useLocale } from "@/components/locale-provider"

export const socialIcons: Record<SocialPlatform, typeof Camera> = {
  instagram: Camera,
  youtube: Video,
  twitter: AtSign,
  spotify: Music2,
  bandcamp: Disc3,
}

// Fila de metadatos secundarios bajo la identidad: ubicación a la izquierda y
// las obras (antes "créditos") a su derecha, separadas por un punto medio. El
// nombre real ya no vive acá — va en su propia línea, más pequeño, justo bajo
// el nombre artístico.
function IdentityRow({ items }: { items: { key: string; node: ReactNode }[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={item.key} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          {item.node}
        </span>
      ))}
    </div>
  )
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
  const contact = data.contactUrl ? resolveContactChannel(data.contactUrl) : null
  const ContactIcon = contact ? CONTACT_CHANNEL_ICONS[contact.channel] : null

  // Ubicación + obras comparten una sola línea (ubicación a la izquierda,
  // obras a su derecha). El nombre real se muestra aparte, más pequeño.
  const metaRow: { key: string; node: ReactNode }[] = []
  if (data.location) {
    metaRow.push({
      key: "location",
      node: (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 text-primary" />
          {data.location}
        </span>
      ),
    })
  }
  if (creditsCount > 0) {
    metaRow.push({
      key: "credits",
      node: <span>{creditsCount} {t(creditsCount === 1 ? "hero_credits_one" : "hero_credits_other")}</span>,
    })
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      {/* Banner de fondo — si no hay imagen, se usa un degradado suave con el color de acento */}
      <div className="relative h-36 w-full overflow-hidden sm:h-52">
        {data.banner ? (
          <img src={data.banner} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />
      </div>

      {/* Cabecera de 3 columnas en escritorio (bio | identidad | acciones),
          apiladas y centradas en móvil mediante `order-*`: foto → nombre/
          ubicación → métrica → bio → redes/botones. */}
      <div className="relative px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
          {/* Columna izquierda — biografía corta. */}
          <div className="order-2 flex flex-col items-center gap-3 sm:order-1 sm:items-start">
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
            {data.realName && (
              <p className="mt-0.5 text-xs font-medium text-muted-foreground/90 sm:text-sm">
                {data.realName}
              </p>
            )}
            <IdentityRow items={metaRow} />
          </div>

          {/* Columna derecha — Contacto + Compartir (uno al lado del otro) y redes.
              Contacto siempre es solo-ícono (canal resuelto en lib/contact-channel.ts);
              Compartir es solo-ícono en móvil y con texto desde sm (escritorio). */}
          <div className="order-3 flex flex-col items-center gap-3 sm:items-end">
            <div className="flex shrink-0 items-center gap-2">
              {contact && ContactIcon && (
                <a
                  href={contact.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("hero_contact_aria")}
                  title={CONTACT_CHANNEL_LABELS[contact.channel]}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <ContactIcon className="size-4" />
                </a>
              )}
              {shareUrl && (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  aria-label={t("hero_share")}
                  className="inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background/60 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent sm:h-auto sm:w-auto sm:px-4 sm:py-2"
                >
                  <Share2 className="size-4" />
                  <span className="hidden sm:inline">{t("hero_share")}</span>
                </button>
              )}
            </div>

            {socials.length > 0 && (
              <nav aria-label={t("hero_social_aria")} className="flex flex-nowrap items-center justify-center gap-2 sm:flex-wrap sm:justify-end">
                {socials.map((social, i) => {
                  const Icon = socialIcons[social.platform] ?? Music2
                  const label = social.label || SOCIAL_PLATFORM_LABELS[social.platform]
                  return (
                    <a
                      key={i}
                      href={social.href || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      <Icon className="size-4 sm:size-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </a>
                  )
                })}
              </nav>
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

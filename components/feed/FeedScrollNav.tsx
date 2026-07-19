"use client"

// Reemplaza la barra de desplazamiento nativa del feed: una cápsula flotante
// con flecha de subir/bajar, distinta a las flechas sueltas de TikTok.

import { ChevronDown, ChevronUp } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

export default function FeedScrollNav({
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  canGoPrev: boolean
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const { t } = useLocale()

  return (
    <div className="pointer-events-auto absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-full border border-border/60 bg-card/50 backdrop-blur-xl sm:right-6">
      <button
        type="button"
        aria-label={t("feed_scroll_prev_aria")}
        disabled={!canGoPrev}
        onClick={onPrev}
        className="flex size-11 items-center justify-center text-foreground/90 transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-foreground/90"
      >
        <ChevronUp className="size-5" />
      </button>
      <div className="h-px w-full bg-border/60" />
      <button
        type="button"
        aria-label={t("feed_scroll_next_aria")}
        disabled={!canGoNext}
        onClick={onNext}
        className="flex size-11 items-center justify-center text-foreground/90 transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-foreground/90"
      >
        <ChevronDown className="size-5" />
      </button>
    </div>
  )
}

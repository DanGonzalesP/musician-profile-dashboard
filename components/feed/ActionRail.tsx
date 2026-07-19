"use client"

// Rail vertical de acciones a la derecha de cada pantalla del feed —
// estilo TikTok: corazón, comentarios (abre el panel lateral) y compartir.
// Cada botón es una loseta de vidrio con contador debajo; el corazón late
// al activarse.

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Heart, MessageCircle, Share2 } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

export default function ActionRail({
  isLiked,
  likeCount,
  commentCount,
  onToggleLike,
  onOpenComments,
  shareUrl,
  shareTitle,
}: {
  isLiked: boolean
  likeCount: number
  commentCount?: number
  onToggleLike: () => void
  // Si es undefined, la pantalla no tiene comentarios (ej. publicaciones).
  onOpenComments?: () => void
  shareUrl: string
  shareTitle: string
}) {
  const { t } = useLocale()
  const [shared, setShared] = useState(false)

  const handleShare = async () => {
    const url = shareUrl.startsWith("http")
      ? shareUrl
      : `${window.location.origin}${shareUrl}`
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url })
        return
      }
    } catch {
      // El usuario canceló el diálogo nativo — no es un error.
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-4">
      <RailButton
        label={isLiked ? t("feed_like_aria_remove") : t("feed_like_aria_add")}
        count={likeCount}
        onClick={onToggleLike}
        active={isLiked}
      >
        <motion.span
          key={isLiked ? "liked" : "unliked"}
          initial={{ scale: isLiked ? 0.4 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className="flex"
        >
          <Heart className={`size-6 ${isLiked ? "fill-primary text-primary" : ""}`} />
        </motion.span>
      </RailButton>

      {onOpenComments && (
        <RailButton
          label={t("feed_comments_open_aria")}
          count={commentCount ?? 0}
          onClick={onOpenComments}
        >
          <MessageCircle className="size-6" />
        </RailButton>
      )}

      <RailButton label={t("feed_share_aria")} onClick={handleShare} active={shared}>
        {shared ? <Check className="size-6 text-primary" /> : <Share2 className="size-6" />}
      </RailButton>
      {shared && (
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="-mt-3 text-[10px] font-semibold text-primary"
        >
          {t("feed_share_copied")}
        </motion.span>
      )}
    </div>
  )
}

function RailButton({
  label,
  count,
  onClick,
  active = false,
  children,
}: {
  label: string
  count?: number
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`flex size-12 items-center justify-center rounded-2xl border backdrop-blur-xl transition-all duration-200 active:scale-90 ${
          active
            ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--primary)]"
            : "border-border/60 bg-card/50 text-foreground/90 hover:border-primary/40 hover:text-foreground"
        }`}
      >
        {children}
      </button>
      {typeof count === "number" && (
        <span className="text-[11px] font-bold tabular-nums text-foreground/80">
          {formatCount(count)}
        </span>
      )}
    </div>
  )
}

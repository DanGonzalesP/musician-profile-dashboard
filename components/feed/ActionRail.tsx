"use client"

// Rail vertical de acciones a la derecha de cada pantalla del feed —
// estilo TikTok: corazón y comentarios (abre el panel lateral). El
// compartir ya no vive acá — vive una sola vez, debajo de la cápsula de
// subir/bajar disco (ver FeedContainer + FeedShareButton).

import { motion } from "framer-motion"
import { Heart, MessageCircle } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

export default function ActionRail({
  isLiked,
  onToggleLike,
  onOpenComments,
}: {
  isLiked: boolean
  onToggleLike: () => void
  // Si es undefined, la pantalla no tiene comentarios (ej. publicaciones).
  onOpenComments?: () => void
}) {
  const { t } = useLocale()

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-4">
      <RailButton
        label={isLiked ? t("feed_like_aria_remove") : t("feed_like_aria_add")}
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
        <RailButton label={t("feed_comments_open_aria")} onClick={onOpenComments}>
          <MessageCircle className="size-6" />
        </RailButton>
      )}
    </div>
  )
}

function RailButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
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
  )
}

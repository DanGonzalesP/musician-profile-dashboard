"use client"

// Botón de compartir del feed — vive debajo de la cápsula de subir/bajar
// disco (FeedScrollNav), no al costado del corazón de "me gusta".

import { useState } from "react"
import { Check, Share2 } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

export default function FeedShareButton({
  shareUrl,
  shareTitle,
}: {
  shareUrl: string
  shareTitle: string
}) {
  const { t } = useLocale()
  const [shared, setShared] = useState(false)

  const handleShare = async () => {
    const url = shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`
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
    <div className="pointer-events-auto flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={t("feed_share_aria")}
        title={t("feed_share_aria")}
        onClick={handleShare}
        className={`flex size-11 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 active:scale-90 ${
          shared
            ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--primary)]"
            : "border-border/60 bg-card/50 text-foreground/90 hover:border-primary/40 hover:text-foreground"
        }`}
      >
        {shared ? <Check className="size-5 text-primary" /> : <Share2 className="size-5" />}
      </button>
      {shared && <span className="text-[10px] font-semibold text-primary">{t("feed_share_copied")}</span>}
    </div>
  )
}

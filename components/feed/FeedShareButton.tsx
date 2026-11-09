"use client"

// Botón de compartir del feed — vive debajo de la cápsula de subir/bajar
// disco (FeedScrollNav), no al costado del corazón de "me gusta".

import { useEffect, useRef, useState } from "react"
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
  const [manualUrl, setManualUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    if (manualUrl) {
      manualInput.current?.focus()
      manualInput.current?.select()
    }
  }, [manualUrl])

  const handleShare = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setManualUrl("")
    const url = shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`
    try {
      try {
        if (navigator.share) {
          await navigator.share({ title: shareTitle, url })
          return
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        // Un fallo de la hoja nativa permite intentar copiar; cancelar no.
      }
      if (!mounted.current) return
      try {
        await navigator.clipboard.writeText(url)
        if (!mounted.current) return
        setShared(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setShared(false), 1800)
      } catch {
        if (mounted.current) setManualUrl(url)
      }
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <div className="pointer-events-auto relative flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={t("feed_share_aria")}
        title={t("feed_share_aria")}
        onClick={handleShare}
        disabled={busy}
        aria-busy={busy}
        className={`flex size-11 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 active:scale-90 ${
          shared
            ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--primary)]"
            : "border-border/60 bg-card/50 text-foreground/90 hover:border-primary/40 hover:text-foreground"
        }`}
      >
        {shared ? <Check className="size-5 text-primary" /> : <Share2 className="size-5" />}
      </button>
      {shared && <span role="status" className="text-[10px] font-semibold text-primary">{t("feed_share_copied")}</span>}
      {manualUrl && <div className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-background p-3 shadow-lg">
        <p role="status" className="mb-2 text-sm text-foreground">{t("feed_share_manual")}</p>
        <input ref={manualInput} type="text" readOnly value={manualUrl} aria-label={t("feed_share_link")} onFocus={event => event.currentTarget.select()} className="min-h-11 w-full rounded border border-border bg-card px-2 text-sm text-foreground" />
      </div>}
    </div>
  )
}

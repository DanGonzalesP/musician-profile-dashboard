"use client"

import { useLocale } from "@/components/locale-provider"

export function AudioPlaybackError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale()
  return <div className="mt-3 rounded-lg border border-destructive/30 bg-card p-3 text-sm">
    <p role="alert" className="text-foreground">{t("audio_playback_error")}</p>
    <button type="button" onClick={onRetry} className="mt-2 min-h-11 rounded-md border border-border px-3 font-medium text-foreground hover:bg-accent">
      {t("audio_playback_retry")}
    </button>
  </div>
}

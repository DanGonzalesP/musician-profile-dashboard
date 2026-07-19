"use client"

// Panel de comentarios del feed — se despliega desde la derecha como en
// TikTok: cabecera con el conteo, lista scrolleable y caja de escritura
// fija abajo. En pantallas chicas sube desde abajo como bottom sheet.
// La carga es perezosa: recién consulta Supabase cuando se abre.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MessageCircle, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import {
  addTrackComment,
  fetchTrackComments,
  type TrackComment,
} from "@/lib/track-comments"
import { supabase } from "@/lib/supabase"

function timeAgo(iso: string, locale: "es" | "en"): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return locale === "es" ? "ahora" : "now"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} d`
}

export default function CommentsPanel({
  trackId,
  trackTitle,
  isSample,
  onClose,
  onCountChange,
}: {
  // null = panel cerrado
  trackId: string | null
  trackTitle: string
  isSample: boolean
  onClose: () => void
  onCountChange: (trackId: string, count: number) => void
}) {
  const { t, locale } = useLocale()
  const [comments, setComments] = useState<TrackComment[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(Boolean(data.user)))
  }, [])

  useEffect(() => {
    if (!trackId || isSample) {
      setComments([])
      return
    }
    let active = true
    setLoading(true)
    fetchTrackComments(trackId).then((list) => {
      if (!active) return
      setComments(list)
      setLoading(false)
      onCountChange(trackId, list.length)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, isSample])

  const handleSend = async () => {
    if (!trackId || !draft.trim() || sending) return
    setSending(true)
    setErrorMessage("")
    try {
      const comment = await addTrackComment(trackId, draft)
      setComments((prev) => [comment, ...prev])
      onCountChange(trackId, comments.length + 1)
      setDraft("")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("feed_comments_error"))
    } finally {
      setSending(false)
    }
  }

  return (
    <AnimatePresence>
      {trackId && (
        <>
          {/* Fondo clickeable para cerrar */}
          <motion.button
            type="button"
            aria-label={t("common_close")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-[2px]"
          />

          <motion.aside
            role="dialog"
            aria-label={t("feed_comments_title")}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border/60 bg-background/95 shadow-2xl backdrop-blur-2xl"
          >
            <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MessageCircle className="size-4 text-primary" />
                  {t("feed_comments_title")}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {comments.length}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{trackTitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common_close")}
                className="flex size-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {isSample ? (
                <EmptyState text={t("feed_comments_sample")} />
              ) : loading ? (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <EmptyState text={t("feed_comments_empty")} />
              ) : (
                comments.map((comment) => (
                  <motion.article
                    key={comment.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-secondary font-display text-sm font-bold text-primary">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {comment.authorName}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {timeAgo(comment.createdAt, locale)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                        {comment.content}
                      </p>
                    </div>
                  </motion.article>
                ))
              )}
            </div>

            <footer className="border-t border-border/60 p-4">
              {errorMessage && (
                <p className="mb-2 text-xs font-medium text-destructive">{errorMessage}</p>
              )}
              {isSample ? null : hasSession ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    maxLength={500}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={t("feed_comments_placeholder")}
                    className="flex-1 rounded-2xl border border-input bg-card/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    aria-label={t("feed_comments_send")}
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="block rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  {t("feed_comments_login")}
                </Link>
              )}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card/50 text-muted-foreground">
        <MessageCircle className="size-5" />
      </span>
      <p className="max-w-56 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

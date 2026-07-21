"use client"

// Overlay que le permite a un visitante (no al dueño) del perfil público
// preguntarle al artista sobre un bloque puntual — ej. "¿en qué estudio
// grabaste este single?". La pregunta llega a la barra de notificaciones
// del dueño (app/perfil/notificaciones, ver lib/profile-questions.ts).

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { HelpCircle, Loader2, Send, X } from "lucide-react"
import { createProfileQuestion } from "@/lib/profile-questions"
import { useLocale } from "@/components/locale-provider"

export function AskAboutBlock({
  profileId,
  blockType,
  blockLabel,
  hasSession,
  children,
}: {
  profileId: string
  blockType: string
  blockLabel: string
  hasSession: boolean
  children: ReactNode
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setErrorMessage("")
    try {
      await createProfileQuestion({ profileId, blockType, blockLabel, message })
      setSent(true)
      setMessage("")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ask_block_error"))
    } finally {
      setSending(false)
    }
  }

  const closeAndReset = () => {
    setOpen(false)
    setTimeout(() => {
      setSent(false)
      setErrorMessage("")
    }, 200)
  }

  return (
    <div className="group/ask relative">
      {children}

      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("ask_block_cta")}
        aria-label={t("ask_block_cta")}
        className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/ask:opacity-100 hover:border-primary/50 hover:text-primary focus-visible:opacity-100 sm:opacity-0"
      >
        <HelpCircle className="size-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={closeAndReset}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t("ask_block_title")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{blockLabel}</p>
              </div>
              <button
                type="button"
                onClick={closeAndReset}
                aria-label={t("common_close")}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {!hasSession ? (
              <Link
                href="/login"
                className="block rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                {t("ask_block_login")}
              </Link>
            ) : sent ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
                {t("ask_block_sent")}
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("ask_block_placeholder")}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {errorMessage && <p className="mt-2 text-xs font-medium text-destructive">{errorMessage}</p>}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t("ask_block_send")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

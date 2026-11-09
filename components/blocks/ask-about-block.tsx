"use client"

// Overlay que le permite a un visitante (no al dueño) del perfil público
// preguntarle al artista sobre un bloque puntual — ej. "¿en qué estudio
// grabaste este single?". La pregunta llega a la barra de notificaciones
// del dueño (app/perfil/notificaciones, ver lib/profile-questions.ts).

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { HelpCircle, Loader2, Send, X } from "lucide-react"
import { createProfileQuestion } from "@/lib/profile-questions"
import { useLocale } from "@/components/locale-provider"
import { supabase } from "@/lib/supabase"

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
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionKnown, setSessionKnown] = useState(false)
  const accountContext = useRef<{ active: boolean; owner: string | null | undefined; version: number } | null>(null)
  const sendLock = useRef(false)
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dialogTitleId = useId()
  const messageId = useId()

  // Otro bloque/perfil empieza desde cero. El estado visible se reinicia al
  // renderizar (patrón de React ante cambio de props); el efecto sólo reconecta Auth.
  const blockKey = JSON.stringify([profileId, blockType, blockLabel])
  const [currentBlockKey, setCurrentBlockKey] = useState(blockKey)
  if (currentBlockKey !== blockKey) {
    setCurrentBlockKey(blockKey)
    setSessionReady(false)
    setSessionKnown(false)
    setOpen(false)
    setMessage("")
    setSent(false)
    setSending(false)
    setErrorMessage("")
  }

  useEffect(() => {
    const context = { active: true, owner: undefined as string | null | undefined, version: 0 }
    accountContext.current = context
    sendLock.current = false
    pendingRequest.current = null
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!context.active || accountContext.current !== context) return
      const owner = session?.user.id ?? null
      if (context.owner !== undefined && context.owner !== owner) {
        context.version += 1
        setOpen(false)
        setMessage("")
        setSent(false)
        setSending(false)
        setErrorMessage("")
        sendLock.current = false
        pendingRequest.current = null
      }
      context.owner = owner
      setSessionReady(Boolean(owner))
      setSessionKnown(true)
    })
    return () => { context.active = false; subscription.unsubscribe() }
  }, [profileId, blockType, blockLabel])

  useEffect(() => {
    if (!message.trim() && !sending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [message, sending])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); previousFocus?.focus() }
  }, [open])

  const handleSend = async () => {
    const context = accountContext.current
    if (!hasSession || !sessionReady || !context?.active || !context.owner || !message.trim() || sendLock.current) return
    const owner = context.owner
    const version = context.version
    const isCurrent = () => context.active && accountContext.current === context && context.version === version
    sendLock.current = true
    setSending(true)
    setErrorMessage("")
    try {
      const signature = JSON.stringify([owner, profileId, blockType, blockLabel, message.trim()])
      if (pendingRequest.current?.signature !== signature) {
        pendingRequest.current = { signature, id: crypto.randomUUID() }
      }
      await createProfileQuestion({ profileId, blockType, blockLabel, message, requestId: pendingRequest.current.id, expectedUserId: owner })
      if (!isCurrent()) return
      pendingRequest.current = null
      setSent(true)
      setMessage("")
    } catch (err) {
      if (!isCurrent()) return
      setErrorMessage(err instanceof Error ? err.message : t("ask_block_error"))
    } finally {
      if (isCurrent()) {
        sendLock.current = false
        setSending(false)
      }
    }
  }

  const closeAndReset = () => {
    if (sendLock.current) return
    setOpen(false)
    setSent(false)
    setErrorMessage("")
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
        <dialog
          ref={dialogRef}
          aria-labelledby={dialogTitleId}
          className="fixed inset-0 z-100 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/70"
          onCancel={event => { event.preventDefault(); closeAndReset() }}
          onClick={event => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeAndReset()
          }}
        >
          <div
            className="w-full p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 id={dialogTitleId} className="text-sm font-semibold text-foreground">{t("ask_block_title")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{blockLabel}</p>
              </div>
              <button
                type="button"
                onClick={closeAndReset}
                disabled={sending}
                aria-label={t("common_close")}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {!hasSession || (sessionKnown && !sessionReady) ? (
              <Link
                href="/login"
                className="block rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                {t("ask_block_login")}
              </Link>
            ) : !sessionKnown ? (
              <p role="status" className="text-sm text-muted-foreground">{t("ask_block_session_pending")}</p>
            ) : sent ? (
              <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
                {t("ask_block_sent")}
              </div>
            ) : (
              <>
                <label htmlFor={messageId} className="sr-only">{t("ask_block_title")}</label>
                <textarea
                  id={messageId}
                  disabled={sending || !sessionReady}
                  value={message}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("ask_block_placeholder")}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {errorMessage && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{errorMessage}</p>}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!message.trim() || sending || !sessionReady}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t("ask_block_send")}
                </button>
              </>
            )}
            {hasSession && (sent || errorMessage) && (
              <Link href="/perfil/notificaciones#sent-questions-heading" target="_blank" rel="noopener noreferrer"
                className="mt-3 flex min-h-11 items-center justify-center text-center text-sm text-primary underline">
                {t("ask_block_view_sent")}
              </Link>
            )}
          </div>
        </dialog>
      )}
    </div>
  )
}

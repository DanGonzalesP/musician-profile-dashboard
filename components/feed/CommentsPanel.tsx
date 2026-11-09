"use client"

// Panel de comentarios del feed. En escritorio vive fijo a la derecha, como
// una columna más del layout (igual que la barra de roles a la izquierda):
// siempre está abierto y reserva su propio espacio, así nunca se superpone
// al reproductor. En pantallas chicas, donde no entra una tercera columna,
// se abre como bottom sheet con el botón de comentarios del rail.

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Loader2, MessageCircle, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { addTrackComment, deleteTrackComment, fetchTrackComments, type TrackComment } from "@/lib/track-comments"
import { addPostComment, deletePostComment, fetchPostComments, type PostComment } from "@/lib/post-comments"
import { supabase } from "@/lib/supabase"
import { COMMENT_PAGE_SIZE } from "@/lib/comment-pagination"
import type { CursorFeed } from "@/lib/feed/keyset"

// Un elemento comentable del feed — canción o publicación. Cada uno vive en
// su propia tabla (feed_comments / feed_post_comments, ver lib/track-comments
// y lib/post-comments) porque una publicación no tiene fila propia contra la
// cual poner una FK real; el panel solo elige qué par fetch/add usar.
export type CommentTarget = { kind: "track" | "post"; id: string; title: string }
type Comment = TrackComment | PostComment

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
  target,
  isSample,
  mobileOpen,
  onCloseMobile,
}: {
  // null = sin canción/publicación activa con comentarios
  target: CommentTarget | null
  isSample: boolean
  // Controla la hoja inferior en móvil; en escritorio el panel siempre está visible.
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { t, locale } = useLocale()
  const reducedMotion = useReducedMotion()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(() => Boolean(target && !isSample))
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const hasSession = Boolean(viewerUserId)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteUncertain, setDeleteUncertain] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const targetKey = target ? `${target.kind}:${target.id}` : ""
  const targetId = target?.id
  const targetKind = target?.kind
  const draft = drafts[targetKey] ?? ""
  const setDraft = (value: string) => setDrafts(previous => ({ ...previous, [targetKey]: value }))
  const [loadFailed, setLoadFailed] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const cursor = useRef<CursorFeed | null>(null)
  const moreLock = useRef(false)
  const [reload, setReload] = useState(0)
  const sendLock = useRef(false)
  const generation = useRef(0)
  const readController = useRef<AbortController | null>(null)
  const requests = useRef(new Map<string, { content: string; id: string }>())
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const mobileDialog = useRef<HTMLDialogElement>(null)
  const mobileClose = useRef<HTMLButtonElement>(null)
  const desktopPanel = useRef<HTMLElement>(null)
  const mobileTitleId = useId()

  // Cada destino/recarga es una lectura nueva: su estado inicial se fija al
  // renderizar (patrón de React para ajustar estado ante un cambio de props),
  // no síncronamente desde el efecto que lanza la consulta.
  const requestKey = `${targetKind ?? ""}:${targetId ?? ""}:${isSample ? 1 : 0}:${reload}`
  const [loadedKey, setLoadedKey] = useState(requestKey)
  if (loadedKey !== requestKey) {
    setLoadedKey(requestKey)
    setComments([])
    setErrorMessage("")
    setSuccessMessage("")
    setLoadFailed(false)
    setHasMore(false)
    setLoadingMore(false)
    setMoreFailed(false)
    setLoading(Boolean(targetId && targetKind && !isSample))
  }

  useEffect(() => {
    if (!mobileOpen) return
    const dialog = mobileDialog.current
    if (!dialog) return
    // La columna de escritorio siempre está montada: se captura una vez por efecto.
    const panel = desktopPanel.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const desktop = window.matchMedia("(min-width: 1024px)")
    const previousOverflow = document.body.style.overflow
    const syncViewport = () => {
      if (desktop.matches) {
        const wasOpen = dialog.open
        dialog.close()
        document.body.style.overflow = previousOverflow
        if (wasOpen || opener) panel?.focus({ preventScroll: true })
      } else {
        if (!dialog.open) dialog.showModal()
        document.body.style.overflow = "hidden"
        mobileClose.current?.focus({ preventScroll: true })
      }
    }
    syncViewport()
    desktop.addEventListener("change", syncViewport)
    return () => {
      desktop.removeEventListener("change", syncViewport)
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus({ preventScroll: true })
      else if (panel?.isConnected) panel.focus({ preventScroll: true })
    }
  }, [mobileOpen])

  useEffect(() => {
    let previousUser: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      if (userId === previousUser) return
      previousUser = userId
      generation.current += 1
      readController.current?.abort()
      setViewerUserId(userId)
      setDrafts({})
      requests.current.clear()
      setErrorMessage("")
      setReload(value => value + 1)
    })
    return () => { generation.current += 1; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    readController.current = controller
    let active = true
    cursor.current = null
    moreLock.current = false
    if (!targetId || !targetKind || isSample) {
      return () => { controller.abort(); generation.current += 1 }
    }
    const fetchComments = targetKind === "track" ? fetchTrackComments : fetchPostComments
    void fetchComments(targetId, undefined, controller.signal).then(list => {
      if (!active || current !== generation.current) return
      setComments(list)
      setDeleteUncertain(false)
      const last = list[list.length - 1]
      cursor.current = last ? { id: last.id, createdAt: last.createdAt } : null
      setHasMore(list.length === COMMENT_PAGE_SIZE)
      setLoading(false)
    }).catch(() => {
      if (!active || current !== generation.current) return
      setLoadFailed(true)
      setLoading(false)
    })
    return () => { active = false; generation.current += 1; controller.abort() }
  }, [targetKind, targetId, isSample, reload])

  const handleSend = async () => {
    if (!target || isSample || !viewerUserId || !draft.trim() || sendLock.current || moreLock.current || loading || loadFailed) return
    sendLock.current = true
    const current = generation.current
    const sentKey = targetKey
    const content = draft.trim()
    setSending(true)
    setErrorMessage("")
    try {
      let request = requests.current.get(sentKey)
      if (!request || request.content !== content) {
        request = { content, id: crypto.randomUUID() }
        requests.current.set(sentKey, request)
      }
      const comment = target.kind === "track"
        ? await addTrackComment(target.id, content, request.id, viewerUserId)
        : await addPostComment(target.id, content, request.id, viewerUserId)
      if (current !== generation.current) return
      requests.current.delete(sentKey)
      setComments(previous => [comment, ...previous.filter(row => row.id !== comment.id)])
      setDrafts(previous => ({ ...previous, [sentKey]: "" }))
    } catch (err) {
      if (current === generation.current) setErrorMessage(err instanceof Error ? err.message : t("feed_comments_error"))
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }

  const loadOlder = async () => {
    if (!target || isSample || !cursor.current || !hasMore || moreLock.current || sendLock.current || loading || loadFailed) return
    moreLock.current = true
    const current = generation.current
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const fetchComments = target.kind === "track" ? fetchTrackComments : fetchPostComments
      const list = await fetchComments(target.id, cursor.current, readController.current?.signal)
      if (current !== generation.current) return
      setComments(previous => {
        const seen = new Set(previous.map(comment => comment.id))
        return [...previous, ...list.filter(comment => !seen.has(comment.id))]
      })
      const last = list[list.length - 1]
      if (last) cursor.current = { id: last.id, createdAt: last.createdAt }
      setHasMore(list.length === COMMENT_PAGE_SIZE)
    } catch {
      if (current === generation.current) setMoreFailed(true)
    } finally {
      if (current === generation.current) { moreLock.current = false; setLoadingMore(false) }
    }
  }

  const handleDelete = async (comment: Comment) => {
    if (!target || !viewerUserId || comment.userId !== viewerUserId || sendLock.current || moreLock.current || loading || loadFailed || deleteUncertain) return
    if (!window.confirm(t("feed_comments_delete_confirm"))) return
    sendLock.current = true
    const current = generation.current
    setDeletingId(comment.id)
    setErrorMessage("")
    setSuccessMessage("")
    try {
      if (target.kind === "track") await deleteTrackComment(comment.id, target.id, viewerUserId)
      else await deletePostComment(comment.id, target.id, viewerUserId)
      if (current !== generation.current) return
      setComments(previous => previous.filter(row => row.id !== comment.id))
      setSuccessMessage(t("feed_comments_deleted"))
    } catch {
      if (current !== generation.current) return
      setDeleteUncertain(true)
      setErrorMessage(t("feed_comments_delete_error"))
    } finally {
      sendLock.current = false
      setDeletingId(null)
    }
  }

  const body = (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {!target ? (
          <EmptyState text={t("feed_comments_none_active")} />
        ) : isSample ? (
          <EmptyState text={t("feed_comments_sample")} />
        ) : loading ? (
          <div role="status" aria-label={t("feed_comments_loading")} className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : loadFailed ? (
          <div role="alert" className="text-sm text-destructive">
            <p>{t("feed_comments_load_error")}</p>
            <button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 min-h-11 rounded-lg border border-current px-3">{t("feed_comments_retry")}</button>
          </div>
        ) : comments.length === 0 ? (
          <EmptyState text={t("feed_comments_empty")} />
        ) : (
          comments.map((comment) => (
            <motion.article
              key={comment.id}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/30 to-secondary font-display text-sm font-bold text-primary">
                {comment.authorName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {comment.authorName}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {timeAgo(comment.createdAt, locale)}
                  </span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground/90">
                  {comment.content}
                </p>
                {comment.userId === viewerUserId && <button type="button"
                  disabled={sending || loadingMore || deletingId !== null || deleteUncertain}
                  onClick={() => void handleDelete(comment)} className="min-h-11 text-xs text-muted-foreground underline disabled:opacity-50">
                  {deletingId === comment.id ? t("feed_comments_deleting") : t("feed_comments_delete")}
                </button>}
              </div>
            </motion.article>
          ))
        )}
        {!loading && !loadFailed && hasMore && <div className="space-y-2 text-center">
          {moreFailed && <p role="alert" className="text-sm text-destructive">{t("feed_comments_older_error")}</p>}
          <button type="button" disabled={loadingMore || sending || deletingId !== null} onClick={() => void loadOlder()} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">
            {loadingMore ? t("feed_comments_loading") : moreFailed ? t("feed_comments_retry") : t("feed_comments_load_older")}
          </button>
        </div>}
      </div>

      <footer className="border-t border-border/60 p-4">
        {successMessage && <p role="status" className="mb-2 text-xs text-foreground">{successMessage}</p>}
        {!loading && !loadFailed && comments.length > 0 && <p role="status" className="mb-2 text-xs text-muted-foreground">{t("feed_comments_loaded", { count: comments.length })}</p>}
        {target && !isSample && <button type="button" disabled={loading || sending || loadingMore || deletingId !== null} onClick={() => setReload(value => value + 1)} className="mb-2 min-h-11 text-xs text-primary underline disabled:opacity-50">{t("feed_comments_refresh")}</button>}
        {errorMessage && (
          <p role="alert" className="mb-2 text-xs font-medium text-destructive">{errorMessage}</p>
        )}
        {!target || isSample ? null : hasSession ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label={t("feed_comments_placeholder")}
              disabled={sending}
              value={draft}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSend() } }}
              placeholder={t("feed_comments_placeholder")}
              className="flex-1 rounded-2xl border border-input bg-card/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || sending || loadingMore || loading || loadFailed || deletingId !== null}
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
    </>
  )

  return (
    <>
      {/* ── Escritorio: columna fija a la derecha, siempre abierta ────── */}
      <aside
        ref={desktopPanel}
        tabIndex={-1}
        aria-label={t("feed_comments_title")}
        className="hidden h-dvh w-80 shrink-0 flex-col border-l border-border/60 bg-background/95 backdrop-blur-2xl lg:flex xl:w-96"
      >
        {/* pt-24 deja libre el espacio del header flotante (logo, iniciar
            sesión / registrarse) que vive por encima de todo el feed. */}
        <header className="flex items-center justify-between border-b border-border/60 px-5 pb-4 pt-24">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <MessageCircle className="size-4 text-primary" />
              {t("feed_comments_title")}
              {target && !loading && !loadFailed && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                  {comments.length}{hasMore ? "+" : ""}
                </span>
              )}
            </p>
            {target && <p className="mt-0.5 truncate text-xs text-muted-foreground">{target.title}</p>}
          </div>
        </header>
        {body}
      </aside>

      {/* ── Móvil: bottom sheet abierta con el botón de comentarios ───── */}
      {mobileOpen && (
        <dialog
          ref={mobileDialog}
          aria-labelledby={mobileTitleId}
          onCancel={event => { event.preventDefault(); onCloseMobile() }}
          onClick={event => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCloseMobile()
          }}
          className="fixed inset-x-0 top-auto bottom-0 m-0 h-[75dvh] max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-border/60 bg-background/95 p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
          <motion.div
            initial={reducedMotion ? false : { y: "100%" }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="flex h-full flex-col"
          >
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <div className="min-w-0">
                  <h2 id={mobileTitleId} className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <MessageCircle className="size-4 text-primary" />
                    {t("feed_comments_title")}
                    {target && !loading && !loadFailed && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                        {comments.length}{hasMore ? "+" : ""}
                      </span>
                    )}
                  </h2>
                  {target && <p className="mt-0.5 truncate text-xs text-muted-foreground">{target.title}</p>}
                </div>
                <button
                  ref={mobileClose}
                  type="button"
                  onClick={onCloseMobile}
                  aria-label={t("common_close")}
                  className="flex size-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </header>
              {body}
          </motion.div>
        </dialog>
      )}
    </>
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

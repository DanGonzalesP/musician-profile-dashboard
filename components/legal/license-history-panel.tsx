"use client"

import { useEffect, useRef, useState } from "react"
import { History, Download } from "lucide-react"
import type { LicenseHistoryEntry } from "@/lib/licenses"
import { supabase } from "@/lib/supabase"

export function LicenseHistoryPanel({ profileId }: { profileId?: string }) {
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])
  if (!profileId || !userId) return null
  return <LicenseHistorySession key={`${profileId}:${userId}`} profileId={profileId} userId={userId} />
}

function LicenseHistorySession({ profileId, userId }: { profileId: string; userId: string }) {
  const [entries, setEntries] = useState<LicenseHistoryEntry[]>([])
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading")
  const [attempt, setAttempt] = useState(0)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState("")
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState("")
  const pageLock = useRef(false)
  const pageRequest = useRef<AbortController | null>(null)
  const active = useRef(false)
  const downloadLock = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false; pageRequest.current?.abort() }
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void import("@/lib/licenses")
      .then(({ fetchLicenseHistory }) => fetchLicenseHistory(profileId, userId, undefined, controller.signal))
      .then(data => {
        if (cancelled) return
        setEntries(data.entries)
        setNextCursor(data.nextCursor)
        setStatus("ready")
      }).catch(() => { if (!cancelled) setStatus("error") })
    return () => { cancelled = true; controller.abort() }
  }, [profileId, userId, attempt])

  async function loadMore() {
    if (!active.current || pageLock.current || nextCursor === null) return
    pageLock.current = true
    setLoadingMore(true)
    setPageError("")
    const controller = new AbortController()
    pageRequest.current = controller
    try {
      const { fetchLicenseHistory } = await import("@/lib/licenses")
      if (!active.current) return
      const page = await fetchLicenseHistory(profileId, userId, nextCursor, controller.signal)
      if (!active.current) return
      setEntries(previous => {
        const ids = new Set(previous.map(entry => entry.id))
        return [...previous, ...page.entries.filter(entry => !ids.has(entry.id))]
      })
      setNextCursor(page.nextCursor)
    } catch {
      if (active.current) setPageError("No se pudieron cargar más licencias. Puedes volver a intentarlo; conservamos las que ya ves.")
    } finally {
      pageLock.current = false
      pageRequest.current = null
      if (active.current) setLoadingMore(false)
    }
  }

  async function handleRedownload(entry: LicenseHistoryEntry) {
    if (downloadLock.current || !active.current) return
    downloadLock.current = true
    setDownloading(entry.id)
    setDownloadError("")
    try {
      const { generateLicensePdf } = await import("@/lib/generate-license-pdf")
      const { data, error } = await supabase.auth.getSession()
      if (!active.current) return
      if (error || data.session?.user.id !== userId) throw new Error("session changed")
      generateLicensePdf({
        artistName: entry.artistName,
        artistLegalName: entry.artistLegalName || "",
        artistDni: entry.artistDni || "",
        organizerName: entry.organizerName,
        eventDate: entry.eventDate,
        eventEndDate: entry.eventEndDate || undefined,
        songs: entry.songs,
      })
    } catch {
      if (active.current) setDownloadError("No pudimos preparar la descarga. Comprueba tu sesión y vuelve a intentarlo.")
    } finally {
      downloadLock.current = false
      if (active.current) setDownloading(null)
    }
  }

  return (
    <section aria-label="Historial de licencias" className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="size-4 text-primary" /> Historial de borradores de licencias
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">La redescarga usa tus datos guardados y la plantilla vigente. No conserva firmas ni acredita aceptación de las partes.</p>
      {status === "loading" && <p role="status" className="mt-3 text-xs text-muted-foreground">Cargando historial…</p>}
      {status === "error" && <div role="alert" className="mt-3 text-xs text-destructive">
        <p>No se pudo cargar el historial.</p>
        <button type="button" className="min-h-11 px-2 underline" onClick={() => {
          setStatus("loading")
          setAttempt(value => value + 1)
        }}>Reintentar carga</button>
      </div>}
      {downloadError && <p role="alert" className="mt-3 text-xs text-destructive">{downloadError}</p>}
      {status === "ready" && entries.length === 0 && (
        <p className="mt-3 text-xs italic text-muted-foreground">Todavía no se ha generado ninguna licencia.</p>
      )}
      {status === "ready" && entries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entries.map(entry => (
            <li key={entry.id} className="rounded-lg border border-border bg-background/40 p-3">
              <p className="break-words text-sm font-medium text-foreground">{entry.organizerName}</p>
              <p className="text-xs text-muted-foreground">
                {entry.eventDate}
                {entry.eventEndDate && entry.eventEndDate !== entry.eventDate ? ` – ${entry.eventEndDate}` : ""}
                {" · "}{entry.songs.length} {entry.songs.length === 1 ? "canción" : "canciones"}
              </p>
              <button type="button" onClick={() => void handleRedownload(entry)} disabled={downloading !== null}
                className="mt-2 flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50">
                <Download className="size-3.5" /> {downloading === entry.id ? "Preparando descarga…" : "Volver a descargar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {status === "ready" && entries.length > 0 && (
        <div className="mt-3 space-y-2">
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {entries.length} licencias cargadas{nextCursor === null ? " · Fin del historial" : ""}
          </p>
          {pageError && <p role="alert" className="text-xs text-destructive">{pageError}</p>}
          {nextCursor !== null && <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
            className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">
            {loadingMore ? "Cargando…" : pageError ? "Reintentar carga" : "Cargar más licencias"}
          </button>}
        </div>
      )}
    </section>
  )
}

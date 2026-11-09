"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { fetchSentCreditRequests, withdrawCreditRequest, SENT_CREDITS_PAGE_SIZE, type SentCreditRequest } from "@/lib/sent-credit-requests"
import type { CursorFeed } from "@/lib/feed/keyset"
import { NOTIFICATIONS_CHANGED } from "@/lib/use-notification-count"

export function SentCreditRequests() {
  const [rows, setRows] = useState<SentCreditRequest[]>([])
  const [cursor, setCursor] = useState<CursorFeed | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [confirmation, setConfirmation] = useState<SentCreditRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const generation = useRef(0)
  const lock = useRef(false)
  const ownerId = useRef<string | null>(null)

  useEffect(() => {
    let previous: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null
      if (next === previous) return
      previous = next
      generation.current += 1
      ownerId.current = null
      lock.current = false
      setRows([]); setCursor(null); setConfirmation(null); setBusy(false)
      setNotice(""); setLoading(true); setFailed(false); setHasMore(false)
      setRevision(value => value + 1)
    })
    return () => { generation.current += 1; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const version = generation.current
    void fetchSentCreditRequests(cursor, controller.signal).then(result => {
      if (controller.signal.aborted || version !== generation.current) return
      ownerId.current = result.userId
      setRows(result.rows); setHasMore(result.rows.length === SENT_CREDITS_PAGE_SIZE)
      setFailed(false); setLoading(false)
    }).catch(() => {
      if (controller.signal.aborted || version !== generation.current) return
      setRows([]); setFailed(true); setLoading(false); setHasMore(false)
    })
    return () => controller.abort()
  }, [cursor, revision])

  function load(next: CursorFeed | null) {
    if (lock.current) return
    generation.current += 1
    setCursor(next); setRows([]); setLoading(true); setFailed(false); setConfirmation(null)
    setRevision(value => value + 1)
  }

  async function withdraw() {
    if (!confirmation || !ownerId.current || lock.current) return
    const request = confirmation
    const userId = ownerId.current
    const version = generation.current
    lock.current = true; setBusy(true); setConfirmation(null); setNotice("")
    try {
      await withdrawCreditRequest(request.id, userId)
      if (version !== generation.current) return
      setNotice("Solicitud retirada. Se conserva en tu historial y ya no puede aceptarse.")
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    } catch {
      if (version !== generation.current) return
      setNotice("No se pudo confirmar la retirada. Consulta el estado actualizado antes de volver a decidir.")
    } finally {
      if (version === generation.current) {
        lock.current = false; setBusy(false); load(cursor)
      }
    }
  }

  const buttonClass = "min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
  return (
    <section aria-labelledby="sent-credits-heading" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sent-credits-heading" className="font-semibold">Colaboraciones que solicitaste</h2>
        <button type="button" disabled={loading || busy} onClick={() => load(null)} className={buttonClass}>Actualizar enviadas</button>
      </div>
      <p className="text-xs text-muted-foreground">Si cambiaste o eliminaste un crédito en el editor, puedes retirar aquí su solicitud pendiente. Las decisiones y solicitudes anteriores conservan su historial.</p>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {loading ? <p role="status">Cargando solicitudes…</p> : failed ? (
        <div role="alert"><p>No se pudieron cargar las solicitudes.</p><button type="button" onClick={() => load(cursor)} className={buttonClass}>Reintentar</button></div>
      ) : rows.length === 0 ? <p className="text-sm text-muted-foreground">No hay solicitudes en esta página.</p> : (
        <ul className="space-y-3">{rows.map(row => (
          <li key={row.id} className="space-y-2 rounded-lg border border-border p-3">
            <p className="font-medium wrap-break-word">{row.song_title}</p>
            <p className="text-sm">Rol: {row.role} · {row.withdrawn_at ? "Retirada" : row.status === "accepted" ? "Aceptada" : row.status === "rejected" ? "Rechazada" : "Pendiente"}</p>
            <time className="block text-xs text-muted-foreground" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("es-PE")}</time>
            {!row.withdrawn_at && row.status === "pending" && <button type="button" disabled={busy} onClick={() => setConfirmation(row)} className={buttonClass}>Retirar solicitud</button>}
          </li>
        ))}</ul>
      )}
      <nav aria-label="Solicitudes de colaboración enviadas" className="flex flex-wrap gap-3">
        <button type="button" disabled={loading || busy || !cursor} onClick={() => load(null)} className={buttonClass}>Volver a las recientes</button>
        <button type="button" disabled={loading || busy || !hasMore} onClick={() => {
          const last = rows.at(-1)
          if (last) load({ id: last.id, createdAt: last.created_at })
        }} className={buttonClass}>Ver anteriores</button>
      </nav>
      {confirmation && <ConfirmDialog title="Retirar solicitud" description={`Se retirará tu solicitud para «${confirmation.song_title}». El destinatario ya no podrá aceptarla. Para solicitarla otra vez tendrás que crear un nuevo crédito.`}
        confirmLabel="Retirar solicitud" onCancel={() => setConfirmation(null)} onConfirm={() => void withdraw()} />}
    </section>
  )
}

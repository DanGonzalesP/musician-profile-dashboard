"use client"

import { useEffect, useRef, useState } from "react"
import LayoutAdmin from "@/components/LayoutAdmin"
import { supabase } from "@/lib/supabase"
import { REPORT_REASONS } from "@/lib/moderation"
import { ModerationNotice } from "@/components/moderation-notice"

type Decision = {
  report_id: string; profile_id: string; profile_name: string | null; reason: string
  status: "aceptado" | "rechazado"; decision_version: number; decided_at: string | null
  profile_suspended: boolean; appeal_id: string | null; appeal_message: string | null
  appeal_created_at: string | null
  appeal_decision_version: number | null
  appeal_outcome: "mantenida" | "restituida" | "revocada" | "superada" | null
  appeal_response: string | null
  appeal_resolved_at: string | null
}

function decisions(value: unknown): value is Decision[] {
  return Array.isArray(value) && value.length <= 50 && value.every(row => row &&
    typeof row.report_id === "string" && typeof row.profile_id === "string" &&
    (row.profile_name === null || typeof row.profile_name === "string") &&
    typeof row.reason === "string" && ["aceptado", "rechazado"].includes(row.status) &&
    Number.isSafeInteger(row.decision_version) && row.decision_version > 0 &&
    typeof row.profile_suspended === "boolean" &&
    (row.decided_at === null || (typeof row.decided_at === "string" && Number.isFinite(Date.parse(row.decided_at)))) &&
    (row.appeal_id === null || typeof row.appeal_id === "string") &&
    (row.appeal_message === null || typeof row.appeal_message === "string") &&
    (row.appeal_decision_version === null || Number.isSafeInteger(row.appeal_decision_version)) &&
    (row.appeal_outcome === null || ["mantenida", "restituida", "revocada", "superada"].includes(row.appeal_outcome)) &&
    (row.appeal_response === null || typeof row.appeal_response === "string") &&
    (row.appeal_resolved_at === null || (typeof row.appeal_resolved_at === "string" && Number.isFinite(Date.parse(row.appeal_resolved_at)))))
}

export default function ModeracionPage() {
  const [rows, setRows] = useState<Decision[]>([])
  const [offset, setOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [mustReload, setMustReload] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const generation = useRef(0)
  const owner = useRef<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextOwner = session?.user.id ?? null
      if (nextOwner === owner.current) return
      owner.current = nextOwner
      generation.current += 1
      lock.current = false
      setRows([])
      setOffset(0)
      setNotes({})
      setMessage("")
      setMustReload(false)
      setBusy(false)
      setFailed(false)
      setLoading(true)
      setReload(value => value + 1)
    })
    return () => { generation.current += 1; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    const version = generation.current
    const isCurrent = () => active && version === generation.current
    async function load() {
      setRows([])
      setLoading(true)
      setFailed(false)
      try {
        const { data: auth, error: authError } = await supabase.auth.getSession()
        if (!isCurrent()) return
        if (authError || !auth.session) throw new Error("unavailable")
        const sessionOwner = auth.session.user.id
        if (owner.current !== null && owner.current !== sessionOwner) throw new Error("unavailable")
        owner.current = sessionOwner
        const { data, error } = await supabase.rpc("my_moderation_decisions_v2", { p_offset: offset })
          .setHeader("Authorization", `Bearer ${auth.session.access_token}`)
        if (error || !decisions(data)) throw new Error("unavailable")
        if (!isCurrent() || owner.current !== sessionOwner) return
        setRows(data)
        setMustReload(false)
      } catch {
        if (isCurrent()) { setRows([]); setFailed(true) }
      } finally { if (isCurrent()) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [offset, reload])

  async function requestReview(row: Decision) {
    if (lock.current || loading || failed || mustReload || row.appeal_decision_version === row.decision_version) return
    const text = (notes[row.report_id] ?? "").trim()
    if (text.length < 20 || text.length > 4000) return
    lock.current = true
    const version = generation.current
    const sessionOwner = owner.current
    setBusy(true)
    setMessage("")
    setMustReload(true)
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession()
      if (authError || !auth.session || auth.session.user.id !== sessionOwner || version !== generation.current) throw new Error("unavailable")
      const { data, error } = await supabase.rpc("request_moderation_review", {
        p_report_id: row.report_id, p_version: row.decision_version, p_message: text,
      }).setHeader("Authorization", `Bearer ${auth.session.access_token}`)
      if (version !== generation.current || owner.current !== sessionOwner) return
      if (error || typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) throw new Error("unconfirmed")
      setMessage("Solicitud registrada. Enviarla no cambia automáticamente la decisión ni la visibilidad del perfil.")
      setReload(value => value + 1)
    } catch {
      if (version === generation.current) setMessage("No pudimos confirmar la solicitud. Actualiza la lista antes de reintentar; conservamos tu texto.")
    } finally { if (version === generation.current) { lock.current = false; setBusy(false) } }
  }

  async function markRead(row: Decision) {
    if (lock.current || loading || failed || mustReload) return
    lock.current = true
    const version = generation.current
    const sessionOwner = owner.current
    setBusy(true)
    setMessage("")
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession()
      if (authError || !auth.session || auth.session.user.id !== sessionOwner || version !== generation.current) throw new Error("unavailable")
      const { data, error } = await supabase.rpc("ack_moderation_notice", {
        p_report_id: row.report_id, p_version: row.decision_version, p_response_at: row.appeal_resolved_at,
      }).setHeader("Authorization", `Bearer ${auth.session.access_token}`)
      if (version !== generation.current || owner.current !== sessionOwner) return
      if (error || data !== true) throw new Error("unconfirmed")
      setMessage("La decisión y la respuesta mostradas quedaron marcadas como leídas.")
      setReload(value => value + 1)
    } catch {
      if (version === generation.current) {
        setMustReload(true)
        setMessage("No pudimos confirmar la lectura o el expediente cambió. Actualiza la lista para consultar su estado actual.")
      }
    } finally { if (version === generation.current) { lock.current = false; setBusy(false) } }
  }

  return <LayoutAdmin><main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
    <header><h1 className="text-2xl font-bold">Decisiones sobre tus perfiles</h1>
      <p className="mt-2 text-sm text-muted-foreground">Consulta los reportes resueltos de los perfiles que te pertenecen. Puedes solicitar una revisión de los reportes aceptados. Esta solicitud dentro de Vibe no sustituye un trámite legal.</p></header>
    <ModerationNotice refresh={reload} />
    <button disabled={busy || loading} onClick={() => setReload(value => value + 1)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Actualizar lista</button>
    {message && <p role="status">{message}</p>}
    {mustReload && !loading && <p className="text-sm">Actualiza la lista para comprobar el estado antes de enviar otra solicitud.</p>}
    {loading ? <p role="status">Cargando decisiones…</p> : failed ? <p role="alert">No pudimos consultar las decisiones. Vuelve a actualizar la lista.</p> : <>
      {rows.length === 0 && <p>No hay decisiones en esta página.</p>}
      {rows.map(row => <article key={row.report_id} className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{row.profile_name || "Tu perfil"}</h2>
        <p>{REPORT_REASONS.find(reason => reason.id === row.reason)?.label ?? "Reporte de contenido"}</p>
        <p>{row.status === "aceptado" ? "Reporte aceptado" : "Reporte rechazado"}{row.decided_at && <> · <time dateTime={row.decided_at}>{new Date(row.decided_at).toLocaleDateString("es-PE")}</time></>}</p>
        <p className="text-sm text-muted-foreground">{row.profile_suspended ? "El perfil está retirado de la vista pública." : "El perfil no está retirado de la vista pública por suspensión."}</p>
        <button type="button" disabled={busy || mustReload} onClick={() => void markRead(row)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Marcar esta decisión y respuesta como leídas</button>
        {row.appeal_id && <div className="space-y-2"><p className="font-medium">Solicitud de revisión registrada</p><p className="whitespace-pre-wrap break-words">{row.appeal_message}</p>
          {row.appeal_outcome ? <div className="rounded-lg border p-3"><h3 className="font-semibold">{row.appeal_outcome === "mantenida" ? "Decisión mantenida" : row.appeal_outcome === "restituida" ? "Perfil restituido por esta revisión" : row.appeal_outcome === "revocada" ? "Decisión revocada" : "La decisión original ya había cambiado"}</h3><p className="whitespace-pre-wrap break-words">{row.appeal_response}</p></div> : <p className="text-sm text-muted-foreground">Pendiente de respuesta. Puedes consultar el estado actualizando esta página.</p>}
        </div>}
        {row.status === "aceptado" && row.appeal_decision_version !== row.decision_version && <form onSubmit={event => { event.preventDefault(); void requestReview(row) }} className="space-y-3">
          <label htmlFor={`review-${row.report_id}`} className="block text-sm">Explica por qué solicitas una revisión (20 a 4000 caracteres)</label>
          <textarea id={`review-${row.report_id}`} required minLength={20} maxLength={4000} disabled={busy} value={notes[row.report_id] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [row.report_id]: event.target.value }))} className="min-h-32 w-full rounded-lg border bg-background p-3" />
          <button disabled={busy || mustReload || (notes[row.report_id] ?? "").trim().length < 20} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50">{busy ? "Enviando…" : "Solicitar revisión"}</button>
        </form>}
      </article>)}
      <nav aria-label="Páginas de decisiones" className="flex gap-4">
        {offset > 0 && <button disabled={busy} onClick={() => setOffset(value => Math.max(0, value - 50))} className="min-h-11 underline">Anterior</button>}
        {rows.length === 50 && offset < 10000 && <button disabled={busy} onClick={() => setOffset(value => value + 50)} className="min-h-11 underline">Siguiente</button>}
      </nav>
    </>}
  </main></LayoutAdmin>
}


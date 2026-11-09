"use client"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/authed-fetch"
import { Button } from "@/components/ui/button"

export type ReportRow = { username?: string | null; can_suspend?: boolean; can_restore?: boolean; id: string; reported_profile_id: string; target_type: string; target_id: string | null; reason: string; details: string; reporter_email: string | null; copyright_sworn_statement: boolean; status: string; moderation_version: number }
type EventRow = { id: number; action: string; note: string; created_at: string }
type ReviewRow = { id: string; decision_version: number; message: string; created_at: string; outcome: string | null; public_response: string | null; can_resolve: boolean }
const actions = { review: "Abrir revisión", dismiss: "Rechazar reporte", accept: "Aceptar sin retirar el perfil", suspend: "Aceptar y retirar todo el perfil", restore: "Restituir perfil y revocar la decisión", revoke: "Decisión revocada sin cambiar otras sanciones" }

function validHistory(value: unknown): value is EventRow[] {
  return Array.isArray(value) && value.length <= 100 && value.every(event =>
    event && typeof event === "object" && Number.isSafeInteger(event.id) &&
    typeof event.action === "string" && Object.hasOwn(actions, event.action) &&
    typeof event.note === "string" && typeof event.created_at === "string" &&
    Number.isFinite(Date.parse(event.created_at)))
}
function validReviews(value: unknown): value is ReviewRow[] {
  return Array.isArray(value) && value.length <= 100 && value.every(row => row &&
    typeof row.id === "string" && Number.isSafeInteger(row.decision_version) &&
    typeof row.message === "string" && typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at)) &&
    (row.outcome === null || ["mantenida", "restituida", "revocada", "superada"].includes(row.outcome)) &&
    (row.public_response === null || typeof row.public_response === "string") && typeof row.can_resolve === "boolean")
}

export function RefreshReports() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Consultando…" : "Volver a consultar esta página"}</Button>
}

export default function ReportQueue({ rows, pendingReviews = false }: { rows: ReportRow[]; pendingReviews?: boolean }) {
  const router = useRouter()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<Record<string, EventRow[]>>({})
  const [reviews, setReviews] = useState<Record<string, ReviewRow[]>>({})
  const [responses, setResponses] = useState<Record<string, string>>({})
  const actionLock = useRef(false)
  const [staleRows, setStaleRows] = useState<ReportRow[] | null>(null)
  const [refreshing, startRefresh] = useTransition()
  // Sólo una nueva respuesta del servidor desbloquea decisiones tras un POST.
  // Conservamos las notas locales al refrescar, incluso si la respuesta se perdió.
  const needsRefresh = staleRows === rows
  const disabled = busy !== null || refreshing
  function refreshQueue() {
    if (actionLock.current || refreshing) return
    startRefresh(() => router.refresh())
  }
  async function decide(row: ReportRow, action: keyof typeof actions) {
    if (actionLock.current || needsRefresh || refreshing) return
    const note = (notes[row.id] ?? "").trim()
    if (note.length < 10 || note.length > 4000) return
    if ((action === "suspend" || action === "restore") && !window.confirm(`${actions[action]}: esta acción cambia la visibilidad pública. ¿Continuar?`)) return
    actionLock.current = true
    setStaleRows(rows)
    setBusy(row.id); setMessage("")
    try {
      const response = await authedFetch("/api/admin/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: row.id, version: row.moderation_version, action, note }) })
      const result = await response.json()
      if (!response.ok || result?.saved !== true) { setMessage(response.status === 409 ? "El reporte cambió. Actualiza la lista antes de decidir." : "No pudimos confirmar la decisión. Actualiza la lista y consulta el historial antes de repetirla."); return }
      setHistory(previous => { const next = { ...previous }; delete next[row.id]; return next })
      setMessage(result.cacheUpdated === true ? "Decisión guardada." : "Decisión guardada. La actualización de caché necesita revisión; no repitas la decisión.")
      startRefresh(() => router.refresh())
    } catch { setMessage("No pudimos confirmar la decisión. Actualiza la lista antes de intentarlo de nuevo.") }
    finally { actionLock.current = false; setBusy(null) }
  }
  async function showHistory(id: string) {
    if (actionLock.current || refreshing) return
    actionLock.current = true
    setBusy(id)
    setMessage("")
    setHistory(previous => { const next = { ...previous }; delete next[id]; return next })
    setReviews(previous => { const next = { ...previous }; delete next[id]; return next })
    try {
      const response = await authedFetch(`/api/admin/reportes?reportId=${encodeURIComponent(id)}`)
      if (!response.ok) { setMessage("No pudimos consultar el historial."); return }
      const result = await response.json()
      if (!validHistory(result?.rows) || !validReviews(result?.reviews)) { setMessage("No pudimos leer el historial y las solicitudes. Vuelve a consultarlos."); return }
      const events = result.rows
      const requests = result.reviews
      setHistory(previous => ({ ...previous, [id]: events }))
      setReviews(previous => ({ ...previous, [id]: requests }))
    } catch { setMessage("No pudimos consultar el historial.") }
    finally { actionLock.current = false; setBusy(null) }
  }
  async function resolveReview(row: ReportRow, request: ReviewRow, outcome: string) {
    const responseText = (responses[request.id] ?? "").trim()
    if (actionLock.current || needsRefresh || refreshing || !request.can_resolve || responseText.length < 20 || responseText.length > 4000) return
    if (!window.confirm("Esta respuesta será visible para el titular. ¿Confirmar?")) return
    actionLock.current = true
    setBusy(row.id)
    setStaleRows(rows)
    setMessage("")
    try {
      const response = await authedFetch("/api/admin/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "review_response", appealId: request.id, outcome, response: responseText }) })
      const result = await response.json()
      if (!response.ok || result?.saved !== true) throw new Error("unconfirmed")
      setReviews(previous => { const next = { ...previous }; delete next[row.id]; return next })
      setHistory(previous => { const next = { ...previous }; delete next[row.id]; return next })
      setMessage(result.cacheUpdated === true ? "Respuesta registrada y disponible para el titular." : "Respuesta registrada. La actualización pública necesita revisión; no repitas la respuesta.")
      startRefresh(() => router.refresh())
    } catch { setMessage("No pudimos confirmar la respuesta. Actualiza la lista y el historial antes de repetirla.") }
    finally { actionLock.current = false; setBusy(null) }
  }
  return <section aria-label="Cola de reportes" className="space-y-6">
    <p role="status" aria-live="polite">{message}</p>
    <div className="space-y-2">
      {needsRefresh && <p role="alert" className="text-sm text-muted-foreground">Actualiza la lista antes de tomar otra decisión. Tus notas se conservarán mientras sigas en esta página.</p>}
      <Button variant="outline" disabled={disabled} onClick={refreshQueue}>{refreshing ? "Actualizando…" : "Actualizar lista"}</Button>
    </div>
    {!rows.length && <p>{pendingReviews ? "No hay solicitudes pendientes en esta página." : "No hay reportes en este estado."}</p>}
    {rows.map(row => <article key={row.id} className="space-y-4 rounded-xl border p-5" aria-labelledby={`report-${row.id}`}>
      <h2 id={`report-${row.id}`} className="text-xl font-semibold">{row.reason.replaceAll("_", " ")}</h2>
      <p className="text-sm text-muted-foreground">Estado del reporte: {row.status.replaceAll("_", " ")}</p>
      <p className="break-words whitespace-pre-wrap">{row.details}</p>
      {row.username && <a href={`/${encodeURIComponent(row.username)}`} target="_blank" rel="noopener noreferrer" className="underline">Consultar perfil reportado (otra pestaña)</a>}
      <dl className="space-y-1 text-sm"><dt>Contenido señalado</dt><dd className="break-all">{row.target_type}: {row.target_id ?? row.reported_profile_id}</dd><dt>Correo de contacto</dt><dd className="break-all">{row.reporter_email ?? "No facilitado"}</dd><dt>Declaración de titularidad</dt><dd>{row.copyright_sworn_statement ? "Presentada" : "No presentada"}</dd></dl>
      <label htmlFor={`note-${row.id}`} className="block font-medium">Nota de la decisión (10 a 4000 caracteres)</label>
      <textarea disabled={disabled} className="min-h-24 w-full rounded-md border bg-background p-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" id={`note-${row.id}`} maxLength={4000} value={notes[row.id] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [row.id]: event.target.value }))} />
      <div className="flex flex-wrap gap-2">{(row.status === "pendiente" ? ["review"] : row.status === "en_revision" ? ["dismiss", "accept", ...(row.can_suspend ? ["suspend"] : [])] : row.status === "aceptado" && row.can_restore ? ["restore"] : []).map(action => <Button key={action} disabled={disabled || needsRefresh || (notes[row.id] ?? "").trim().length < 10} variant={action === "suspend" ? "destructive" : "outline"} onClick={() => decide(row, action as keyof typeof actions)}>{actions[action as keyof typeof actions]}</Button>)}
      <Button variant="outline" disabled={disabled} onClick={() => showHistory(row.id)}>Historial y solicitudes de revisión</Button></div>
      {reviews[row.id] && <section aria-label="Solicitudes del titular" className="space-y-3"><h3 className="font-semibold">Solicitudes de revisión</h3>
        {reviews[row.id].length === 0 ? <p>No hay solicitudes registradas.</p> : reviews[row.id].map(request => <div key={request.id} className="rounded-lg border p-3">
          <p className="text-sm">Decisión {request.decision_version} · <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString("es-PE")}</time></p>
          <p className="whitespace-pre-wrap break-words">{request.message}</p>
          {request.outcome ? <div><p className="font-semibold">Respuesta registrada: {request.outcome}</p><p className="whitespace-pre-wrap break-words">{request.public_response}</p></div> : request.can_resolve ? <div className="mt-3 space-y-3">
            <label htmlFor={`response-${request.id}`} className="block text-sm">Respuesta visible para el titular (20 a 4000 caracteres). No incluyas datos del denunciante ni notas internas.</label>
            <textarea id={`response-${request.id}`} disabled={disabled} maxLength={4000} value={responses[request.id] ?? ""} onChange={event => setResponses(previous => ({ ...previous, [request.id]: event.target.value }))} className="min-h-24 w-full rounded-lg border bg-background p-3" />
            <div className="flex flex-wrap gap-2">{(request.decision_version !== row.moderation_version || row.status !== "aceptado" ? [["superada", "Cerrar: decisión ya modificada"]] : [["mantenida", "Mantener decisión"], ...(row.can_restore ? [["restituida", "Restituir perfil"]] : [["revocada", "Revocar decisión sin cambiar otras sanciones"]])]).map(([outcome, label]) => <Button key={outcome} variant="outline" disabled={disabled || needsRefresh || (responses[request.id] ?? "").trim().length < 20} onClick={() => resolveReview(row, request, outcome)}>{label}</Button>)}</div>
          </div> : <p className="mt-2 text-sm text-muted-foreground">Debe responder otro moderador que no haya participado en este expediente.</p>}
        </div>)}
      </section>}
      {history[row.id] && <ol aria-label="Últimas 100 decisiones registradas" className="space-y-2">{history[row.id].length === 0 ? <li>Sin decisiones registradas.</li> : history[row.id].map(event => <li key={event.id} className="border-l-2 pl-3"><p>{actions[event.action as keyof typeof actions] ?? event.action} · <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("es-PE")}</time></p><p className="whitespace-pre-wrap break-words">{event.note}</p></li>)}</ol>}
    </article>)}
  </section>
}



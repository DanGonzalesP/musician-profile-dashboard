"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

const labels = { owner: "Administrador principal", moderator: "Moderador", maintenance: "Mantenimiento" }
type Role = keyof typeof labels
type Row = { user_id: string; role: Role; updated_at: string }
type Selection = { userId: string; current: Row | null }
type HistoryRow = { id: string; actor_user_id: string | null; target_user_id: string; old_role: Role | null; new_role: Role | null; created_at: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const control = "min-h-11 rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
function rows(value: unknown): value is Row[] {
  return Array.isArray(value) && value.length <= 21 && value.every(row => row && typeof row === "object" &&
    typeof row.user_id === "string" && uuid.test(row.user_id) && Object.hasOwn(labels, row.role) &&
    typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at)))
}

function historyRows(value: unknown): HistoryRow[] {
  if (!Array.isArray(value) || value.length > 21) throw new Error("history")
  let previous: bigint | null = null
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("history")
    const row = item as Record<string, unknown>
    // PostgREST puede serializar bigint como número: no aceptar cursores redondeados.
    if (typeof row.id === "number" && !Number.isSafeInteger(row.id)) throw new Error("cursor")
    if (typeof row.id !== "number" && typeof row.id !== "string") throw new Error("cursor")
    const id = String(row.id)
    if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807") || (previous !== null && BigInt(id) >= previous)) throw new Error("cursor")
    previous = BigInt(id)
    if ((row.actor_user_id !== null && (typeof row.actor_user_id !== "string" || !uuid.test(row.actor_user_id))) ||
      typeof row.target_user_id !== "string" || !uuid.test(row.target_user_id) ||
      (row.old_role !== null && (typeof row.old_role !== "string" || !Object.hasOwn(labels, row.old_role))) ||
      (row.new_role !== null && (typeof row.new_role !== "string" || !Object.hasOwn(labels, row.new_role))) ||
      typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new Error("history")
    return { id, actor_user_id: row.actor_user_id as string | null, target_user_id: row.target_user_id,
      old_role: row.old_role as Role | null, new_role: row.new_role as Role | null, created_at: row.created_at }
  })
}

export default function RoleManager({ actorId }: { actorId: string }) {
  const [directory, setDirectory] = useState<Row[] | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [target, setTarget] = useState("")
  const [desired, setDesired] = useState<Role | "">("")
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const live = useRef(false)
  const invalid = useRef(false)
  const lock = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    live.current = true
    // Contador de generación, no un nodo DOM: la limpieza invalida su valor más reciente.
    const generationRef = generation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === actorId) return
      invalid.current = true
      generation.current++
      setExpired(true); setDirectory(null); setHistory(null); setSelection(null); setTarget(""); setNotice(""); setError("")
    })
    return () => { live.current = false; generationRef.current++; subscription.unsubscribe() }
  }, [actorId])

  async function perform(operation: "list" | "lookup" | "save" | "history", after?: string) {
    if (lock.current || invalid.current) return
    const userId = target.trim().toLowerCase()
    if (operation === "lookup" && !uuid.test(userId)) { setError("Introduce un identificador de cuenta válido."); return }
    if (operation === "save" && (!selection || !window.confirm(`¿Confirmas ${desired ? `asignar ${labels[desired]}` : "retirar el acceso administrativo"} a la cuenta ${selection.userId}?`))) return
    lock.current = true; setBusy(true); setError(""); setNotice("")
    const version = generation.current
    const active = () => live.current && !invalid.current && version === generation.current
    let submitted = false
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active()) return
      if (sessionError || !data.session || data.session.user.id !== actorId) throw new Error("session")
      const authorization = `Bearer ${data.session.access_token}`
      if (operation === "history") {
        setHistory(null)
        const result = await supabase.rpc("platform_role_history", { p_before: after ?? null, p_limit: 21 })
          .setHeader("Authorization", authorization)
        if (!active()) return
        if (result.error) throw new Error("history")
        const parsed = historyRows(result.data)
        if (after && parsed.some(row => BigInt(row.id) >= BigInt(after))) throw new Error("cursor")
        setHistory(parsed)
        return
      }
      if (operation === "save" && selection) {
        submitted = true
        const result = await supabase.rpc("set_platform_role_if_current", {
          p_user_id: selection.userId, p_role: desired || null,
          p_expected_updated_at: selection.current?.updated_at ?? null,
        }).setHeader("Authorization", authorization)
        if (!active()) return
        setSelection(null); setDirectory(null); setHistory(null)
        if (result.error) {
          setError(result.error.code === "PT409"
            ? "El rol cambió desde tu consulta o el cambio dejaría a Vibe sin administrador principal. Consulta de nuevo antes de decidir."
            : "No se confirmó el cambio. Comprueba el estado actual antes de intentarlo otra vez; se requiere permiso de administrador principal y una cuenta existente.")
          return
        }
        setNotice("Cambio confirmado. Consulta de nuevo para ver los permisos actuales.")
        return
      }
      if (operation === "lookup") setSelection(null)
      else { setDirectory(null); setSelection(null) }
      const result = await supabase.rpc("platform_role_directory", {
        p_user_id: operation === "lookup" ? userId : null, p_after: after ?? null,
      }).setHeader("Authorization", authorization)
      if (!active()) return
      if (result.error || !rows(result.data)) throw new Error("read")
      if (operation === "lookup") {
        if (result.data.length > 1 || result.data.some(row => row.user_id !== userId)) throw new Error("response")
        setSelection({ userId, current: result.data[0] ?? null }); setDesired(result.data[0]?.role ?? "")
      } else setDirectory(result.data)
    } catch {
      if (active()) {
        setSelection(null)
        setHistory(null)
        setDirectory(null)
        setError(submitted ? "Se perdió la confirmación del cambio. Consulta el rol antes de repetir la operación." : "No pudimos consultar los permisos. Comprueba tu sesión y vuelve a intentarlo.")
      }
    } finally {
      lock.current = false
      if (live.current) setBusy(false)
    }
  }

  return <section className="space-y-6" aria-label="Gestión de roles">
    {expired ? <p role="alert">La sesión cambió. Vuelve a entrar desde Administración para gestionar permisos con la cuenta actual.</p> : <>
      <div className="space-y-3">
        <button type="button" className={control} disabled={busy} onClick={() => void perform("list")}>Consultar equipo desde el inicio</button>
        {directory && (directory.length ? <ul className="divide-y divide-border rounded-lg border border-border">
          {directory.slice(0, 20).map(row => <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="break-all font-mono text-sm">{row.user_id}{row.user_id === actorId ? " (tu cuenta)" : ""}</p><p>{labels[row.role]}</p></div>
            <button type="button" className={control} disabled={busy} onClick={() => { setTarget(row.user_id); setSelection({ userId: row.user_id, current: row }); setDesired(row.role); setError(""); setNotice("") }}>Gestionar<span className="sr-only"> {row.user_id}</span></button>
          </li>)}
        </ul> : <p>No hay asignaciones en esta página.</p>)}
        {directory && directory.length > 20 && <button type="button" className={control} disabled={busy} onClick={() => void perform("list", directory[19].user_id)}>Siguientes cuentas</button>}
      </div>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void perform("lookup") }}>
        <label htmlFor="role-account" className="block font-semibold">Identificador de la cuenta</label>
        <p id="role-account-help" className="text-sm text-muted-foreground">Usa el UUID de una cuenta cuya identidad hayas confirmado. Esta consulta no busca correos ni comprueba que una cuenta sin rol exista.</p>
        <input id="role-account" aria-describedby="role-account-help" autoComplete="off" spellCheck={false} maxLength={36} required value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setSelection(null) }} className={`${control} w-full font-mono`} />
        <button type="submit" className={control} disabled={busy}>Consultar cuenta</button>
      </form>
      {selection && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="break-all">Cuenta: {selection.userId}</p>
        <p>Rol consultado: {selection.current ? labels[selection.current.role] : "Sin rol administrativo"}.</p>
        <label htmlFor="role-choice" className="block font-semibold">Nuevo acceso</label>
        <select id="role-choice" value={desired} disabled={busy} onChange={event => setDesired(event.target.value as Role | "")} className={`${control} w-full`}>
          <option value="">Sin acceso administrativo</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="text-sm text-muted-foreground">Administrador principal gestiona permisos, moderación y mantenimiento. Moderador revisa reportes. Mantenimiento consulta colas y usa las herramientas de limpieza autorizadas.</p>
        <button type="button" className={control} disabled={busy || desired === (selection.current?.role ?? "")} onClick={() => void perform("save")}>Revisar y confirmar cambio</button>
      </div>}
      <section aria-labelledby="role-history-title" className="space-y-4 border-t border-border pt-6">
        <h2 id="role-history-title" className="text-xl font-semibold">Historial de permisos</h2>
        <p className="text-sm text-muted-foreground">Cambios registrados en la base de datos, del más reciente al más antiguo. Consultar no modifica permisos.</p>
        <button type="button" className={control} disabled={busy} onClick={() => void perform("history")}>Consultar cambios más recientes</button>
        {history && (history.length ? <ol className="space-y-3">
          {history.slice(0, 20).map(row => <li key={row.id} className="space-y-2 rounded-lg border border-border p-4">
            <p className="font-semibold">{row.old_role ? labels[row.old_role] : "Sin rol"} → {row.new_role ? labels[row.new_role] : "Sin rol"}</p>
            <time dateTime={row.created_at} className="text-sm">{new Date(row.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })} (hora de Perú)</time>
            <dl className="space-y-1 text-sm"><dt>Cuenta afectada</dt><dd className="break-all font-mono">{row.target_user_id}</dd>
              <dt>Responsable registrado</dt><dd className="break-all font-mono">{row.actor_user_id ?? "Sin sesión de usuario registrada"}</dd>
              <dt>Operación</dt><dd>{row.id}</dd></dl>
          </li>)}
        </ol> : <p>No hay cambios en esta página del historial.</p>)}
        {history && history.length > 20 && <button type="button" className={control} disabled={busy} onClick={() => void perform("history", history[19].id)}>Cambios anteriores</button>}
      </section>
    </>}
    {busy && <p role="status">Procesando…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}

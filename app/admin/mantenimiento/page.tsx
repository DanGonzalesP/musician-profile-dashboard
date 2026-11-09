"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

const metrics = {
  closuresPending: "Cuentas pendientes de eliminación",
  closuresWithoutJob: "Cierres sin trabajo asignado todavía",
  uploadsExpired: "Reservas de subida vencidas",
  retirementsPending: "Borrados interrumpidos recuperables",
  jobsLeased: "Trabajos con plazo de ejecución vigente",
  jobsLeaseExpired: "Trabajos cuyo plazo de ejecución venció",
  jobsBlocked: "Trabajos bloqueados en el último intento",
  jobsWaitingRetry: "Trabajos esperando su próximo intento",
}
type Overview = Record<keyof typeof metrics, number> & { observedAt: string; oldestClosureAt: string | null; oldestUploadExpiryAt: string | null }
function valid(value: unknown): value is Overview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return Object.keys(metrics).every(key => typeof row[key] === "number" && Number.isSafeInteger(row[key]) && (row[key] as number) >= 0) &&
    typeof row.observedAt === "string" && Number.isFinite(Date.parse(row.observedAt)) &&
    [row.oldestClosureAt, row.oldestUploadExpiryAt].every(date => date === null || (typeof date === "string" && Number.isFinite(Date.parse(date))))
}
function dateLabel(value: string | null) {
  return value === null ? "Sin pendientes" : new Date(value).toLocaleString("es-PE")
}

export default function MaintenancePage() {
  const [data, setData] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState("")
  const version = useRef(0)
  const owner = useRef<string | null>(null)
  const mounted = useRef(false)
  const request = useRef(0)

  const refresh = useCallback(async () => {
    const generation = version.current
    const id = ++request.current
    const active = () => mounted.current && version.current === generation && request.current === id
    setBusy(true)
    setData(null)
    setError("")
    try {
      const { data: session, error: authError } = await supabase.auth.getSession()
      if (!active()) return
      if (authError || !session.session || session.session.user.id !== owner.current) throw new Error("auth")
      const result = await supabase.rpc("media_maintenance_overview")
        .setHeader("Authorization", `Bearer ${session.session.access_token}`)
      if (!active()) return
      if (result.error || !valid(result.data)) throw new Error("read")
      setData(result.data)
    } catch {
      if (active()) setError("No pudimos consultar el mantenimiento. Se requiere permiso de mantenimiento y la base actualizada. No se ejecutó ninguna limpieza.")
    } finally {
      if (active()) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    let live = true
    // Contador de generación, no un nodo DOM: la limpieza invalida su valor más reciente.
    const versionRef = version
    const identify = (userId: string | null) => {
      if (!live) return
      owner.current = userId
      version.current++
      void refresh()
    }
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== owner.current) queueMicrotask(() => identify(session?.user.id ?? null))
    })
    const initial = version.current
    void supabase.auth.getSession().then(({ data: session, error: authError }) => {
      if (live && version.current === initial) identify(authError ? null : session.session?.user.id ?? null)
    }).catch(() => { if (live && version.current === initial) identify(null) })
    return () => { live = false; mounted.current = false; versionRef.current++; owner.current = null; listener.subscription.unsubscribe() }
  }, [refresh])

  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
    <Link href="/admin" className="inline-flex min-h-11 items-center underline">Administración de Vibe</Link>
    <header><h1 className="text-2xl font-bold">Estado del mantenimiento</h1><p className="mt-2 text-sm text-muted-foreground">Resumen de la base de datos, sin identidades ni nombres de archivos. Consultar no inicia ni reintenta trabajos.</p></header>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50">Actualizar estado</button>
    {busy && <p role="status">Consultando…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p className="text-sm">Consulta: <time dateTime={data.observedAt}>{dateLabel(data.observedAt)}</time></p>
      {(data.jobsBlocked > 0 || data.jobsLeaseExpired > 0) && <p role="status" className="rounded-lg border border-border bg-card p-4">Hay trabajos bloqueados o con plazo vencido. Revisa los registros del ejecutor antes de intervenir. El panel no los fuerza ni cambia su autorización.</p>}
      <table className="w-full text-sm"><caption className="sr-only">Colas de mantenimiento</caption><tbody>{Object.entries(metrics).map(([key, label]) => <tr key={key} className="border-b border-border"><th scope="row" className="py-3 text-left font-normal">{label}</th><td className="text-right font-semibold">{data[key as keyof typeof metrics]}</td></tr>)}</tbody></table>
      <dl className="space-y-2 text-sm"><dt>Cierre pendiente más antiguo</dt><dd>{dateLabel(data.oldestClosureAt)}</dd><dt>Reserva vencida más antigua</dt><dd>{dateLabel(data.oldestUploadExpiryAt)}</dd></dl>
      <p className="text-xs text-muted-foreground">Las categorías pueden coincidir. Un plazo vigente no demuestra que el ejecutor siga conectado; una cola vacía tampoco demuestra que las alertas, R2 o el programador estén configurados.</p>
    </>}
    <Link href="/cleanup" className="inline-block underline">Limpieza manual de tu inventario</Link>
  </main>
}

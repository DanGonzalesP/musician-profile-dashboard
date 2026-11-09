"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type StorageSummary = { usedBytes: number; pendingBytes: number; unknownFiles: number; limitBytes: number; enforced: boolean }
function size(bytes: number) {
  if (bytes === 0) return "0 MB"
  const unit = bytes >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2
  return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(Math.ceil(bytes / unit * 10) / 10)} ${unit === 1024 ** 3 ? "GB" : "MB"}`
}

export function AccountStorageSummary() {
  const [summary, setSummary] = useState<StorageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    let identity: string | null | undefined
    const controller = new AbortController()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null
      if (identity !== undefined && identity !== next) {
        active = false
        controller.abort()
        setSummary(null)
        setRevision(value => value + 1)
      }
      identity = next
    })
    async function load() {
      setLoading(true)
      setFailed(false)
      setSummary(null)
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!active) return
        if (error || !data.session) throw new Error("session")
        identity = data.session.user.id
        const response = await fetch("/api/account/storage", { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new Error("storage")
        const result = await response.json()
        if (![result.usedBytes, result.pendingBytes, result.unknownFiles, result.limitBytes].every(value => Number.isSafeInteger(value) && value >= 0) || result.limitBytes === 0 || result.pendingBytes > result.usedBytes || typeof result.enforced !== "boolean") throw new Error("response")
        if (active) setSummary(result)
      } catch {
        if (active) setFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; controller.abort(); listener.subscription.unsubscribe() }
  }, [revision])

  return <section aria-labelledby="account-storage-title" className="my-6 space-y-3 rounded-xl border border-border bg-card p-5">
    <h2 id="account-storage-title" className="font-semibold">Almacenamiento de tu cuenta</h2>
    <p className="text-sm text-muted-foreground">Incluye los archivos y las reservas de subida atribuidos a esta cuenta, también cuando colaboras en un grupo.</p>
    {loading && <p role="status" className="text-sm">Consultando espacio…</p>}
    {failed && <p role="alert" className="text-sm">No pudimos consultar tu espacio. Esto no significa que esté vacío. Vuelve a intentarlo.</p>}
    {summary && <>
      <p className="text-sm"><strong>{size(summary.usedBytes)}</strong> contabilizados · {size(summary.limitBytes)} de {summary.enforced ? "límite" : "referencia"}</p>
      <progress aria-label="Espacio contabilizado respecto del límite de referencia" value={Math.min(summary.usedBytes, summary.limitBytes)} max={summary.limitBytes} className="h-3 w-full accent-primary" />
      <p className="text-sm text-muted-foreground">De ese total, {size(summary.pendingBytes)} corresponden a subidas pendientes de completar o retirar. Cancelar una subida no libera espacio inmediatamente.</p>
      {summary.unknownFiles > 0 && <p role="status" className="text-sm">Hay {summary.unknownFiles} archivos históricos cuyo tamaño falta comprobar. El total mostrado puede ser menor al real.</p>}
      {!summary.enforced && <p className="text-sm text-muted-foreground">La cuota está en observación: la referencia mostrada no bloquea por sí sola nuevas subidas.</p>}
      {summary.enforced && (summary.usedBytes >= summary.limitBytes || summary.unknownFiles > 0) && <p role="status" className="text-sm">Las nuevas subidas pueden quedar bloqueadas. Revisa los archivos que ya no necesitas en el editor y publica los cambios; la retirada debe completarse antes de liberar su espacio.</p>}
    </>}
    <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50">{failed ? "Reintentar consulta" : "Actualizar espacio"}</button>
  </section>
}

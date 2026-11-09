"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { hasPlatformPermission } from "@/lib/admin"

type Folder = "audio" | "images" | "video"
type CleanupResult = {
  folder: Folder
  alcance: "propios"
  simular: boolean
  ventanaDeGraciaDias: number
  summary: Record<"total" | "inUse" | "orphaned" | "deleted" | "failed" | "protegidosPorGracia" | "sinAtribuir" | "fueraDeAlcance" | "protegidosAlRetirar", number>
  deleted: string[]
  failed: { key: string; error: string }[]
}
const labels: Record<keyof CleanupResult["summary"], string> = {
  total: "Archivos encontrados en esta carpeta",
  inUse: "Referenciados en el contenido visible",
  orphaned: "Candidatos a retirar",
  deleted: "Retirados",
  failed: "Fallos de retirada",
  protegidosPorGracia: "Conservados por ser recientes",
  sinAtribuir: "Conservados por falta de atribución",
  fueraDeAlcance: "Fuera de tu inventario propio",
  protegidosAlRetirar: "Conservados al comprobar la retirada",
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function isResult(value: unknown): value is CleanupResult {
  if (!record(value) || !record(value.summary)) return false
  const summary = value.summary
  return ["audio", "images", "video"].includes(String(value.folder)) && value.alcance === "propios" &&
    typeof value.simular === "boolean" && typeof value.ventanaDeGraciaDias === "number" && Number.isFinite(value.ventanaDeGraciaDias) && value.ventanaDeGraciaDias >= 0 &&
    Object.keys(labels).every(key => typeof summary[key] === "number" && Number.isSafeInteger(summary[key]) && (summary[key] as number) >= 0) &&
    Array.isArray(value.deleted) && value.deleted.every(key => typeof key === "string") &&
    Array.isArray(value.failed) && value.failed.every(item => record(item) && typeof item.key === "string" && typeof item.error === "string") &&
    value.deleted.length === summary.deleted && value.failed.length === summary.failed
}

export default function CleanupPage() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking")
  const [folder, setFolder] = useState<Folder>("audio")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState("")
  const owner = useRef<string | null>(null)
  const generation = useRef(0)
  const lock = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    let live = true
    mounted.current = true
    // Contador de generación, no un nodo DOM: la limpieza invalida su valor más reciente.
    const generationRef = generation
    async function identify(userId: string | null) {
      if (!live || (owner.current === userId && userId !== null)) return
      const version = ++generation.current
      owner.current = userId
      setResult(null)
      setError("")
      setAccess("checking")
      const permitted = userId ? await hasPlatformPermission(supabase, "maintenance") : false
      if (live && version === generation.current) setAccess(permitted ? "allowed" : "denied")
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid awaiting another Auth/DB operation inside the auth callback.
      queueMicrotask(() => { void identify(session?.user.id ?? null) })
    })
    const initialVersion = generation.current
    void supabase.auth.getSession().then(({ data: sessionData, error: failure }) => {
      if (live && initialVersion === generation.current) void identify(failure ? null : sessionData.session?.user.id ?? null)
    }).catch(() => { if (live && initialVersion === generation.current) void identify(null) })
    return () => { live = false; mounted.current = false; owner.current = null; generationRef.current++; data.subscription.unsubscribe() }
  }, [])

  async function run(simular: boolean) {
    if (lock.current || access !== "allowed" || !owner.current) return
    if (!simular && (!result?.simular || result.folder !== folder || !result.summary.orphaned)) return
    if (!simular && !window.confirm("¿Retirar los archivos elegibles de tu inventario en esta carpeta? Se volverá a revisar el estado actual; los candidatos pueden cambiar desde la consulta. Esta acción no tiene deshacer desde el panel.")) return
    const actor = owner.current
    const version = generation.current
    const selectedFolder = folder
    const current = () => owner.current === actor && generation.current === version
    lock.current = true
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || data.session?.user.id !== actor || !current()) throw new Error("session")
      const response = await fetch("/api/cleanup-orphaned-files", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ folder: selectedFolder, alcance: "propios", simular }),
        cache: "no-store",
      })
      if (!current()) return
      if (response.status === 401 || response.status === 403) {
        setAccess("denied")
        throw new Error("permission")
      }
      if (!response.ok) throw new Error("request")
      const json: unknown = await response.json()
      if (!current()) return
      if (!isResult(json) || json.folder !== selectedFolder || json.simular !== simular) throw new Error("result")
      setResult(json)
    } catch {
      if (current()) setError(simular
        ? "No se pudo completar la consulta. No se solicitó retirar archivos. Comprueba tu acceso y la configuración del servicio."
        : "No se pudo confirmar el resultado completo. Algunos archivos podrían haberse retirado. Vuelve a consultar antes de decidir otro intento.")
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 text-foreground">
      <Link href="/dashboard" className="text-sm underline">Volver al panel</Link>
      <Link href="/admin/mantenimiento" className="ml-4 text-sm underline">Estado de las colas</Link>
      <h1 className="text-2xl font-bold">Mantenimiento de archivos</h1>
      <p className="text-sm text-muted-foreground">Revisa archivos de tu propio inventario que podrían retirarse. La base comprueba de nuevo las referencias y permisos antes de cada retirada. Los archivos ajenos o sin propiedad acreditada se conservan.</p>
      {access === "checking" && <p role="status">Comprobando acceso…</p>}
      {access === "denied" && <p role="alert">Necesitas una sesión con permiso de mantenimiento. No se muestra el inventario de otra cuenta. <Link href="/login" className="underline">Iniciar sesión</Link></p>}
      {access === "allowed" && <>
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label htmlFor="cleanup-folder" className="block text-sm font-medium">Tipo de archivo</label>
          <select id="cleanup-folder" disabled={busy} value={folder} onChange={event => { setFolder(event.target.value as Folder); setResult(null); setError("") }} className="rounded-md border border-input bg-background p-2">
            <option value="audio">Audio</option><option value="images">Imágenes</option><option value="video">Video</option>
          </select>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => void run(true)} className="min-h-11 rounded-md border border-border px-4 disabled:opacity-50">Consultar sin retirar archivos</button>
            {result?.simular && result.summary.orphaned > 0 && <button type="button" disabled={busy} onClick={() => void run(false)} className="min-h-11 rounded-md bg-destructive px-4 text-destructive-foreground disabled:opacity-50">Retirar archivos elegibles</button>}
          </div>
          {busy && <p role="status">Procesando. No inicies otra limpieza mientras esta operación sigue en curso.</p>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>}
        {result && <section className="space-y-4" aria-label="Resultado del mantenimiento">
          <p role="status" className="font-semibold">{result.simular ? "Consulta terminada. No se retiraron archivos." : result.summary.failed > 0 ? "Retirada terminada con fallos pendientes." : "Operación terminada. Revisa el resumen."}</p>
          <p className="text-sm text-muted-foreground">Protección por antigüedad: {result.ventanaDeGraciaDias} días. La consulta no reserva los candidatos: la retirada vuelve a evaluar el inventario actual.</p>
          <table className="w-full text-sm"><caption className="sr-only">Resumen de archivos de {result.folder}</caption><tbody>
            {Object.entries(labels).map(([key, label]) => <tr key={key} className="border-b border-border"><th scope="row" className="py-3 text-left font-normal">{label}</th><td className="text-right font-semibold">{result.summary[key as keyof typeof labels]}</td></tr>)}
          </tbody></table>
          {result.failed.length > 0 && <details><summary className="cursor-pointer">Archivos con fallos ({result.failed.length})</summary><ul className="mt-2 space-y-2 break-all text-xs">{result.failed.map(item => <li key={item.key}><code>{item.key}</code>: No se pudo retirar.</li>)}</ul></details>}
          {result.deleted.length > 0 && <details><summary className="cursor-pointer">Archivos retirados ({result.deleted.length})</summary><ul className="mt-2 space-y-2 break-all text-xs">{result.deleted.map(key => <li key={key}><code>{key}</code></li>)}</ul></details>}
        </section>}
      </>}
    </main>
  )
}

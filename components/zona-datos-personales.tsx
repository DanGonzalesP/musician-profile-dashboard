"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react"
import { EXPORT_DATA_CATEGORIES, exportarMisDatos } from "@/lib/moderation"
import { supabase } from "@/lib/supabase"

// Derechos del titular de los datos: acceso/portabilidad y supresión.
//
// Ley 29733 (Perú) arts. 19 y 20, y GDPR arts. 15, 17 y 20. No existía ningún
// mecanismo en la app, lo que es especialmente grave porque Vibe almacena
// DNIs (nombre legal y documento para la Licencia Express).

export function ZonaDatosPersonales({ displayName, ownerUserId }: { displayName: string; ownerUserId: string }) {
  const router = useRouter()
  const [exportando, setExportando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState("")
  const [error, setError] = useState("")
  const [solicitada, setSolicitada] = useState(false)
  const [pendiente, setPendiente] = useState<{ archivos: number; revision: boolean } | null>(null)
  const [eliminada, setEliminada] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [categoriasCopia, setCategoriasCopia] = useState<string[]>([])
  const actionLock = useRef(false)
  const active = useRef(false)
  const invalidated = useRef(false)
  const closingDeletedSession = useRef(false)
  const exportController = useRef<AbortController | null>(null)
  const [sessionChanged, setSessionChanged] = useState(false)

  useEffect(() => {
    active.current = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active.current || session?.user.id === ownerUserId || (!session && closingDeletedSession.current)) return
      invalidated.current = true
      exportController.current?.abort()
      setSessionChanged(true)
      setTextoConfirmacion("")
      setCategoriasCopia([])
      setMensaje("")
    })
    return () => { active.current = false; exportController.current?.abort(); listener.subscription.unsubscribe() }
  }, [ownerUserId])

  async function originalSession() {
    const { data, error: authError } = await supabase.auth.getSession()
    if (!active.current || invalidated.current || authError || !data.session || data.session.user.id !== ownerUserId) {
      if (active.current) {
        invalidated.current = true
        setSessionChanged(true)
      }
      throw new Error("session changed")
    }
    return data.session
  }

  const PALABRA_CLAVE = "ELIMINAR"

  const exportar = async () => {
    if (actionLock.current || eliminada || solicitada || invalidated.current) return
    actionLock.current = true
    setExportando(true)
    setError("")
    setMensaje("")
    setCategoriasCopia([])
    const controller = new AbortController()
    exportController.current = controller
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 60_000)
    try {
      await originalSession()
      const datos = await exportarMisDatos(ownerUserId, controller.signal)
      await originalSession()
      if (controller.signal.aborted) throw new Error("export cancelled")
      const categorias = EXPORT_DATA_CATEGORIES.filter(([key]) => Array.isArray(datos[key])).map(([, label]) => label)
      // Se descarga como archivo en vez de mostrarse: el objetivo legal es
      // que la persona se lleve una copia reutilizable.
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement("a")
      enlace.href = url
      enlace.download = `vibe-mis-datos-${new Date().toISOString().slice(0, 10)}.json`
      try {
        document.body.appendChild(enlace)
        enlace.click()
        setCategoriasCopia(categorias)
      } finally {
        enlace.remove()
        // Permitir que el navegador consuma el enlace antes de liberarlo.
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setMensaje("Copia preparada. Revisa las descargas de tu navegador y guarda el archivo en un lugar privado.")
    } catch {
      if (!active.current || invalidated.current) return
      if (timedOut) setError("La preparación tardó demasiado. Puedes volver a intentarlo; tus datos no se modificaron.")
      else if (controller.signal.aborted) setMensaje("Preparación cancelada. Tus datos no se modificaron.")
      else setError("No se pudieron exportar tus datos. Inténtalo más tarde.")
    } finally {
      clearTimeout(timeout)
      if (exportController.current === controller) exportController.current = null
      actionLock.current = false
      if (active.current) setExportando(false)
    }
  }

  const eliminar = async () => {
    if (actionLock.current || eliminada || invalidated.current) return
    if (!solicitada && textoConfirmacion !== PALABRA_CLAVE) return
    actionLock.current = true
    setEliminando(true)
    setError("")
    setMensaje("")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    let deletionConfirmed = false
    try {
      // Se usa la ruta de API, no la función SQL directa: además de borrar las
      // filas hay que borrar los archivos de R2, y Postgres no puede hacerlo.
      const session = await originalSession()
      setSolicitada(true)
      // Fijar la autorización evita que un cambio de cuenta cambie el objetivo
      // de una solicitud ya confirmada. Un fallo de red puede haberla iniciado.
      const res = await fetch("/api/eliminar-cuenta", {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!active.current || invalidated.current) return
      if (!res.ok) throw new Error("No se pudo confirmar la eliminación. Puedes continuar para consultar su estado.")
      if (res.status === 200 && cuerpo.eliminada === true) {
        deletionConfirmed = true
        setEliminada(true)
        setPendiente(null)
        // No cerrar una sesión distinta si cambió mientras el servidor retiraba
        // la cuenta original. Una respuesta tardía tampoco navega otra cuenta.
        await originalSession()
        closingDeletedSession.current = true
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" }).catch(() => ({ error: true }))
        if (signOutError) {
          setError("La cuenta ya fue eliminada, pero no pudimos limpiar la sesión de este navegador. Cierra esta pestaña.")
          return
        }
        if (active.current && !invalidated.current) router.replace("/")
      } else if (res.status === 202 && cuerpo.eliminada === false
        && Number.isSafeInteger(cuerpo.archivosPendientes) && cuerpo.archivosPendientes >= 0
        && typeof cuerpo.requiereRevision === "boolean") {
        setPendiente({ archivos: cuerpo.archivosPendientes, revision: cuerpo.requiereRevision })
      } else {
        throw new Error("No se pudo confirmar la eliminación. Vuelve a intentarlo.")
      }
    } catch {
      if (!active.current || invalidated.current) return
      setError(deletionConfirmed
        ? "La cuenta ya fue eliminada, pero no pudimos limpiar la sesión de este navegador. Cierra esta pestaña."
        : "No pudimos confirmar el estado de la solicitud. Conserva esta página y vuelve a consultar; no se iniciará otra eliminación.")
    } finally {
      clearTimeout(timeout)
      actionLock.current = false
      if (active.current) setEliminando(false)
    }
  }

  if (sessionChanged) return <section aria-label="Tus datos" className="space-y-3 rounded-xl border border-border p-4">
    <p role="alert" className="text-sm">La sesión cambió. Este formulario quedó bloqueado para proteger los datos de la cuenta original.</p>
    <p className="text-sm text-muted-foreground">Si ya enviaste una eliminación, el proceso puede seguir en curso para esa cuenta. Vuelve a ella y consulta su estado. Recargar no cancela una solicitud enviada.</p>
    <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-4 text-sm">Recargar configuración</button>
  </section>

  if (eliminada) return <section aria-label="Tus datos" className="space-y-3 rounded-xl border border-border p-4">
    <p role="status" className="text-sm font-semibold">La eliminación de tu cuenta fue confirmada.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>

  return (
    <section aria-label="Tus datos" className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-bold">Tus datos</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Puedes descargar tus datos o solicitar la eliminación de tu cuenta. Descarga tu copia
          antes de comenzar la eliminación.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          La copia incluye perfiles, datos privados, bloques y el inventario de archivos. Al prepararla verás las categorías disponibles en tu copia.
          No descarga los archivos de audio, imagen o video ni incluye todavía todas las interacciones.
          Puede contener información personal sensible.
        </p>
      </div>

      <button
        type="button"
        onClick={exportar}
        disabled={exportando || eliminando || solicitada}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium transition-colors hover:bg-accent/40 disabled:opacity-50"
      >
        {exportando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Descargar mis datos (JSON)
      </button>
      {exportando && <div className="flex flex-wrap items-center gap-2 text-xs">
        <p role="status">Preparando tu copia. Puedes cancelar la espera.</p>
        <button type="button" onClick={() => exportController.current?.abort()}
          className="min-h-11 rounded-lg border px-3">Cancelar preparación</button>
      </div>}

      {categoriasCopia.length > 0 && <div className="space-y-2 rounded-lg border p-3 text-xs">
        <p className="font-semibold">Categorías de la última copia preparada</p>
        <ul className="list-disc space-y-1 pl-4">{categoriasCopia.map(categoria => <li key={categoria}>{categoria}</li>)}</ul>
        <p className="text-muted-foreground">Una categoría puede estar vacía si no tienes registros. Esta lista no confirma que el navegador haya guardado el archivo.</p>
      </div>}

      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-xs font-semibold text-destructive">Eliminar mi cuenta</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Se oculta tu perfil <strong>{displayName || "de artista"}</strong> y se bloquean los
              cambios mientras se retiran tus archivos y datos. Algunos archivos pueden necesitar
              revisión antes de completar el proceso. <strong>No se puede deshacer.</strong>
            </p>
          </div>
        </div>

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={exportando || eliminando}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Quiero eliminar mi cuenta
          </button>
        ) : (
          <div className="space-y-2">
            {!solicitada && <><label htmlFor="confirmar-eliminacion" className="block text-[11px] text-muted-foreground">
              Escribe <span className="font-mono font-bold text-destructive">{PALABRA_CLAVE}</span>{" "}
              para confirmar:
            </label>
            <input
              id="confirmar-eliminacion"
              type="text"
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              autoComplete="off"
              disabled={eliminando || exportando}
              className="w-full rounded-lg border border-destructive/40 bg-background p-2 text-sm"
            /></>}
            {pendiente && <p role="status" className="text-xs leading-relaxed text-muted-foreground">
              {pendiente.revision
                ? "Tu perfil está oculto y la eliminación necesita revisión de archivos. La cuenta aún no se ha eliminado. Puedes consultar de nuevo el estado."
                : `Tu perfil está oculto. Quedan ${pendiente.archivos} archivos por retirar. Continúa para completar la eliminación.`}
            </p>}
            <div className="flex gap-2">
              {!solicitada && <button
                type="button"
                disabled={eliminando || exportando}
                onClick={() => {
                  setConfirmando(false)
                  setTextoConfirmacion("")
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-medium"
              >
                Cancelar
              </button>}
              <button
                type="button"
                onClick={eliminar}
                disabled={(!solicitada && textoConfirmacion !== PALABRA_CLAVE) || eliminando || exportando}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-700 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-40"
              >
                {eliminando && <Loader2 className="size-3.5 animate-spin" />}
                {eliminando ? "Procesando eliminación…" : solicitada ? "Continuar eliminación" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
      {mensaje && <p role="status" className="text-xs text-muted-foreground">{mensaje}</p>}
    </section>
  )
}

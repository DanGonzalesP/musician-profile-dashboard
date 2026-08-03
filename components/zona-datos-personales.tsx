"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react"
import { exportarMisDatos } from "@/lib/moderation"
import { authedFetch } from "@/lib/authed-fetch"
import { supabase } from "@/lib/supabase"

// Derechos del titular de los datos: acceso/portabilidad y supresión.
//
// Ley 29733 (Perú) arts. 19 y 20, y GDPR arts. 15, 17 y 20. No existía ningún
// mecanismo en la app, lo que es especialmente grave porque Vibe almacena
// DNIs (nombre legal y documento para la Licencia Express).

export function ZonaDatosPersonales({ displayName }: { displayName: string }) {
  const router = useRouter()
  const [exportando, setExportando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState("")
  const [error, setError] = useState("")

  const PALABRA_CLAVE = "ELIMINAR"

  const exportar = async () => {
    setExportando(true)
    setError("")
    try {
      const datos = await exportarMisDatos()
      // Se descarga como archivo en vez de mostrarse: el objetivo legal es
      // que la persona se lleve una copia reutilizable.
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement("a")
      enlace.href = url
      enlace.download = `vibe-mis-datos-${new Date().toISOString().slice(0, 10)}.json`
      enlace.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron exportar tus datos.")
    } finally {
      setExportando(false)
    }
  }

  const eliminar = async () => {
    if (textoConfirmacion !== PALABRA_CLAVE) return
    setEliminando(true)
    setError("")
    try {
      // Se usa la ruta de API, no la función SQL directa: además de borrar las
      // filas hay que borrar los archivos de R2, y Postgres no puede hacerlo.
      const res = await authedFetch("/api/eliminar-cuenta", { method: "POST" })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(cuerpo.error ?? "No se pudo eliminar la cuenta.")

      await supabase.auth.signOut()
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la cuenta.")
      setEliminando(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-bold">Tus datos</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Puedes llevarte una copia de todo lo tuyo o borrar tu cuenta por completo, en cualquier
          momento y sin pedirlo por correo.
        </p>
      </div>

      <button
        type="button"
        onClick={exportar}
        disabled={exportando}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium transition-colors hover:bg-accent/40 disabled:opacity-50"
      >
        {exportando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Descargar mis datos (JSON)
      </button>

      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-xs font-semibold text-destructive">Eliminar mi cuenta</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Se borra tu perfil <strong>{displayName || "de artista"}</strong>, tus bloques, tu
              música, tus archivos, tu tienda y tus datos legales (incluido tu DNI). Tus enlaces y
              QR dejan de funcionar. <strong>No se puede deshacer.</strong>
            </p>
          </div>
        </div>

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Quiero eliminar mi cuenta
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block text-[11px] text-muted-foreground">
              Escribe <span className="font-mono font-bold text-destructive">{PALABRA_CLAVE}</span>{" "}
              para confirmar:
            </label>
            <input
              type="text"
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-destructive/40 bg-background p-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmando(false)
                  setTextoConfirmacion("")
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={textoConfirmacion !== PALABRA_CLAVE || eliminando}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-40"
              >
                {eliminando && <Loader2 className="size-3.5 animate-spin" />}
                Eliminar definitivamente
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
    </section>
  )
}

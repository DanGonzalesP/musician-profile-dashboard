"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Flag, Loader2, X } from "lucide-react"
import { crearReporte, REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/lib/moderation"

// Reportar contenido. Hasta ahora /legal/copyright y /legal/comunidad
// describían un proceso de denuncia que no existía en ninguna parte de la
// aplicación: la única vía real era escribir un correo.
//
// Se admite SIN sesión a propósito: quien denuncia un uso indebido de su obra
// casi nunca tiene cuenta en Vibe.

export function ReportDialog({
  profileId,
  targetType = "perfil",
  targetId,
  className = "",
}: {
  profileId: string
  targetType?: ReportTargetType
  targetId?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<ReportReason>("derechos_de_autor")
  const [detalles, setDetalles] = useState("")
  const [correo, setCorreo] = useState("")
  const [juramento, setJuramento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")
  const envioActivo = useRef(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); anterior?.focus() }
  }, [abierto])

  const esCopyright = motivo === "derechos_de_autor"

  const enviar = async () => {
    if (envioActivo.current || enviado) return
    envioActivo.current = true
    setEnviando(true)
    setError("")
    try {
      await crearReporte({
        reportedProfileId: profileId,
        targetType,
        targetId,
        reason: motivo,
        details: detalles,
        swornStatement: juramento,
        reporterEmail: correo,
      })
      setEnviado(true)
      setDetalles("")
      setCorreo("")
      setJuramento(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el reporte.")
    } finally {
      envioActivo.current = false
      setEnviando(false)
    }
  }

  const cerrar = () => {
    if (envioActivo.current) return
    setAbierto(false)
    setEnviado(false)
    setError("")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-destructive ${className}`}
      >
        <Flag className="size-3" />
        Reportar
      </button>
    {abierto && <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-titulo`}
      className="fixed inset-0 z-50 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); cerrar() }}
    >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={`${id}-titulo`} className="text-base font-bold">Reportar contenido</h2>
          <button type="button" onClick={cerrar} disabled={enviando} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="size-4" />
          </button>
        </div>

        {enviado ? (
          <div className="space-y-3 py-2">
            <p role="status" className="text-sm font-semibold text-emerald-500">Reporte recibido.</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              El reporte quedó registrado para revisión. Enviarlo no retira automáticamente
              el contenido ni significa que se haya tomado una decisión.
            </p>
            <button
              type="button"
              onClick={cerrar}
              className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form className="space-y-3" aria-busy={enviando} onSubmit={event => { event.preventDefault(); void enviar() }}>
            <div>
              <label htmlFor={`${id}-motivo`} className="mb-1 block text-xs text-muted-foreground">¿Qué ocurre?</label>
              <select
                id={`${id}-motivo`}
                disabled={enviando}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as ReportReason)}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {REPORT_REASONS.find((r) => r.id === motivo)?.ayuda}
              </p>
            </div>

            <div>
              <label htmlFor={`${id}-detalles`} className="mb-1 block text-xs text-muted-foreground">Detalles</label>
              <textarea
                id={`${id}-detalles`}
                disabled={enviando}
                required
                minLength={10}
                value={detalles}
                onChange={(e) => setDetalles(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={
                  esCopyright
                    ? "Indica qué obra tuya se está usando, dónde está publicada originalmente y qué parte de este perfil la reproduce."
                    : "Cuéntanos qué viste y dónde."
                }
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-sm"
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground/70">{detalles.length}/2000</p>
            </div>

            <div>
              <label htmlFor={`${id}-correo`} className="mb-1 block text-xs text-muted-foreground">
                Tu correo (opcional, para contacto sobre el reporte)
              </label>
              <input
                id={`${id}-correo`}
                disabled={enviando}
                maxLength={320}
                autoComplete="email"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
              />
            </div>

            {esCopyright && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-muted-foreground">
                <input
                  type="checkbox"
                  disabled={enviando}
                  checked={juramento}
                  onChange={(e) => setJuramento(e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  Declaro bajo responsabilidad que soy el titular de los derechos de esta obra (o su
                  representante autorizado) y que su uso aquí no cuenta con mi permiso. Entiendo que
                  una denuncia falsa puede acarrear consecuencias legales.
                </span>
              </label>
            )}

            {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={enviando || detalles.trim().length < 10 || (esCopyright && !juramento)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {enviando && <Loader2 className="size-4 animate-spin" />}
              {enviando ? "Enviando reporte…" : "Enviar reporte"}
            </button>
          </form>
        )}
    </dialog>}
    </>
  )
}

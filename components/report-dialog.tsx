"use client"

import { useState } from "react"
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

  const esCopyright = motivo === "derechos_de_autor"

  const enviar = async () => {
    if (enviando) return
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el reporte.")
    } finally {
      setEnviando(false)
    }
  }

  const cerrar = () => {
    setAbierto(false)
    setTimeout(() => {
      setEnviado(false)
      setError("")
      setDetalles("")
      setJuramento(false)
    }, 200)
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-destructive ${className}`}
      >
        <Flag className="size-3" />
        Reportar
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold">Reportar contenido</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {enviado ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-emerald-500">Reporte recibido.</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Lo vamos a revisar. Si dejaste un correo, te escribimos con la decisión. En los
              reclamos por derechos de autor, el perfil reportado tiene derecho a presentar una
              contranotificación antes de que se tome una medida definitiva.
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
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">¿Qué ocurre?</label>
              <select
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
              <label className="mb-1 block text-xs text-muted-foreground">Detalles</label>
              <textarea
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
              <label className="mb-1 block text-xs text-muted-foreground">
                Tu correo {esCopyright ? "(necesario para responderte)" : "(opcional)"}
              </label>
              <input
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

            {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

            <button
              type="button"
              onClick={enviar}
              disabled={enviando || detalles.trim().length < 10 || (esCopyright && !juramento)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {enviando && <Loader2 className="size-4 animate-spin" />}
              Enviar reporte
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

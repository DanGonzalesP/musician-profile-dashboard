"use client"

import { useState } from "react"
import { ShieldCheck, FileText, Award } from "lucide-react"

interface TrackProof {
  id: string
  title: string
  hasProof: boolean
  hash?: string
}

export function LicensingModule() {
  // Datos simulados de las canciones del artista para el flujo
  const [tracks, setTracks] = useState<TrackProof[]>([
    { id: "1", title: "Sample Song 1", hasProof: true, hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    { id: "2", title: "Sample Song 2", hasProof: false }
  ])

  const generarSelloDigital = (trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          hasProof: true,
          hash: Math.random().toString(16).substring(2) + "fa83bc7291de..."
        }
      }
      return t
    }))
    alert("¡Sello de autoría generado con éxito! Archivo protegido con SHA-256.")
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl max-w-xl mx-auto my-6">
      <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
        <ShieldCheck className="size-6 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Derechos de Autor y Licencias</h3>
          <p className="text-xs text-muted-foreground">Protege tus pistas musicales y gestiona tus contratos digitales.</p>
        </div>
      </div>

      <div className="space-y-4">
        {tracks.map((track) => (
          <div key={track.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background">
            <div>
              <p className="text-xs font-medium text-foreground">{track.title}</p>
              {track.hasProof ? (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <Award className="size-3" /> Protegido (SHA-256)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  Sin registrar
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {!track.hasProof ? (
                <button
                  type="button"
                  onClick={() => generarSelloDigital(track.id)}
                  className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Registrar Autoría
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => alert(`Contrato tipo: Comercial / Standard disponible para este track. \nHash: ${track.hash}`)}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <FileText className="size-3.5" /> Ver Contrato
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
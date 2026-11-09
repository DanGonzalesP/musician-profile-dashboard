"use client"

import { useEffect, useRef, useState } from "react"
import { FileCheck2, Loader2, ShieldCheck } from "lucide-react"
import type { LicenseSongOption } from "@/lib/blocks"
import type { LegalSettings } from "@/lib/legal-settings"
import { supabase } from "@/lib/supabase"

export function LicenseTool({
  data,
  songOptions = [],
  profileId,
  ownerUserId,
  onRecorded,
}: {
  data: LegalSettings
  songOptions?: LicenseSongOption[]
  profileId: string
  ownerUserId: string
  onRecorded: () => void
}) {
  const [organizerName, setOrganizerName] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventEndDate, setEventEndDate] = useState("")
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [notice, setNotice] = useState("")
  const active = useRef(false)
  const generationLock = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const artistName = data.artistStageName || data.artistLegalName
  const hasArtistData = Boolean(artistName && data.artistDni)

  function toggleSong(id: string) {
    setSelectedSongs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGenerate() {
    if (!active.current || generationLock.current) return
    if (!hasArtistData) {
      setError("Completa tu nombre y DNI arriba antes de generar licencias.")
      return
    }
    if (!organizerName.trim()) {
      setError("Ingresa el nombre del organizador o local.")
      return
    }
    if (!eventDate) {
      setError("Selecciona la fecha del evento.")
      return
    }
    if (eventEndDate && eventEndDate < eventDate) {
      setError("La fecha final no puede ser anterior a la del evento.")
      return
    }
    const songs = songOptions.filter((s) => selectedSongs.has(s.id)).map((s) => s.label)
    if (songs.length === 0) {
      setError("Selecciona al menos una canción a licenciar.")
      return
    }

    generationLock.current = true
    setError(null)
    setNotice("")
    setGenerating(true)
    const input = {
      artistName,
      artistLegalName: data.artistLegalName,
      artistDni: data.artistDni,
      organizerName: organizerName.trim(),
      eventDate,
      eventEndDate,
      songs,
    }
    try {
      const { generateLicensePdf } = await import("@/lib/generate-license-pdf")
      const { data: auth, error: authError } = await supabase.auth.getSession()
      if (!active.current) return
      if (authError || auth.session?.user.id !== ownerUserId) throw new Error("session")
      generateLicensePdf(input)
      // La descarga y el registro son operaciones distintas: comunicar el resultado parcial.
      try {
        const { recordLicense } = await import("@/lib/licenses")
        if (!active.current) return
        await recordLicense(profileId, input, ownerUserId)
        if (!active.current) return
        setNotice("Descarga solicitada y licencia registrada en tu historial.")
        onRecorded()
      } catch {
        if (active.current) setError("La descarga del PDF se solicitó, pero no pudimos confirmar su registro. Revisa el historial antes de generar otra licencia para evitar duplicados.")
      }
    } catch {
      if (active.current) setError("No se pudo preparar la descarga. Comprueba tu sesión y vuelve a intentarlo.")
    } finally {
      generationLock.current = false
      if (active.current) setGenerating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        <FileCheck2 className="size-5 text-primary" />
        Generador de Licencias Express
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Prepara un borrador de autorización para un evento. Antes de firmarlo, revisa qué derechos
        puedes autorizar, los acuerdos de gestión colectiva y los permisos de otros titulares.
      </p>

      {!hasArtistData && (
        <p className="mt-4 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          Completa tu nombre y DNI arriba antes de generar licencias.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Organizador / Local</span>
          <input
            disabled={generating}
            type="text"
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            placeholder="Ej. Bar La Estación / Juan Pérez"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Fecha del evento</span>
          <input
            disabled={generating}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Hasta (opcional, si es un período)</span>
          <input
            disabled={generating}
            type="date"
            value={eventEndDate}
            onChange={(e) => setEventEndDate(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Canciones a licenciar</p>
        {songOptions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
            Publica tu perfil con al menos una canción para poder seleccionarlas aquí.
          </p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {songOptions.map((song) => (
              <label
                key={song.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent/50"
              >
                <input
                  disabled={generating}
                  type="checkbox"
                  checked={selectedSongs.has(song.id)}
                  onChange={() => toggleSong(song.id)}
                  className="size-3.5 shrink-0 accent-primary"
                />
                <span className="truncate">{song.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {artistName && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-primary" />
          Licenciante: <span className="font-medium text-foreground">{artistName}</span>
          {data.artistDni && <span>· DNI {data.artistDni}</span>}
        </div>
      )}

      {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs font-medium text-destructive">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="min-h-11 mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {generating ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
        {generating ? "Generando..." : "Generar Licencia"}
      </button>

      <p className="mt-2 text-center text-[10px] italic text-muted-foreground">
        Documento modelo generado automáticamente — no sustituye asesoría legal profesional.
      </p>
    </div>
  )
}

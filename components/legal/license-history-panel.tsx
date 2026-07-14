"use client"

import { useEffect, useState } from "react"
import { History, Download } from "lucide-react"
import type { LicenseHistoryEntry } from "@/lib/licenses"

export function LicenseHistoryPanel({ profileId }: { profileId?: string }) {
  const [entries, setEntries] = useState<LicenseHistoryEntry[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle")

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    setStatus("loading")
    import("@/lib/licenses").then(({ fetchLicenseHistory }) => {
      fetchLicenseHistory(profileId)
        .then((data) => {
          if (cancelled) return
          setEntries(data)
          setStatus("ready")
        })
        .catch(() => {
          if (!cancelled) setStatus("error")
        })
    })
    return () => {
      cancelled = true
    }
  }, [profileId])

  async function handleRedownload(entry: LicenseHistoryEntry) {
    const { generateLicensePdf } = await import("@/lib/generate-license-pdf")
    generateLicensePdf({
      artistName: entry.artistName,
      artistLegalName: entry.artistLegalName || "",
      artistDni: entry.artistDni || "",
      organizerName: entry.organizerName,
      eventDate: entry.eventDate,
      eventEndDate: entry.eventEndDate || undefined,
      songs: entry.songs,
    })
  }

  if (!profileId) return null

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="size-4 text-primary" /> Historial de licencias emitidas
      </p>
      {status === "loading" && <p className="mt-3 text-xs text-muted-foreground">Cargando...</p>}
      {status === "error" && <p className="mt-3 text-xs text-destructive">No se pudo cargar el historial.</p>}
      {status === "ready" && entries.length === 0 && (
        <p className="mt-3 text-xs italic text-muted-foreground">Todavía no se ha generado ninguna licencia.</p>
      )}
      {status === "ready" && entries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border bg-background/40 p-3">
              <p className="truncate text-sm font-medium text-foreground">{entry.organizerName}</p>
              <p className="text-xs text-muted-foreground">
                {entry.eventDate}
                {entry.eventEndDate && entry.eventEndDate !== entry.eventDate ? ` – ${entry.eventEndDate}` : ""}
                {" · "}
                {entry.songs.length} {entry.songs.length === 1 ? "canción" : "canciones"}
              </p>
              <button
                type="button"
                onClick={() => handleRedownload(entry)}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Download className="size-3.5" /> Volver a descargar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

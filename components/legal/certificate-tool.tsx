"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Download, Fingerprint, Loader2, Music } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { normalizeBlockData, type TracksData, type Track } from "@/lib/blocks"
import { logSupabaseError } from "@/lib/log-supabase-error"

type TrackRow = {
  albumTitle: string
  albumIndex: number
  trackIndex: number
  track: Track
}

type RowStatus = "idle" | "hashing" | "fetching" | "error" | "not-registered"

export function CertificateTool({ profileId, artistName }: { profileId?: string; artistName?: string }) {
  const [blockId, setBlockId] = useState<number | null>(null)
  const [tracksData, setTracksData] = useState<TracksData | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle")
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})

  useEffect(() => {
    if (!profileId) return
    let cancelled = false

    async function load() {
      setStatus("loading")
      const { data, error } = await supabase
        .from("profile_blocks")
        .select("id, content")
        .eq("profile_id", profileId)
        .eq("block_type", "tracks")
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setStatus("error")
        return
      }
      if (!data) {
        setTracksData({ albums: [] })
        setStatus("ready")
        return
      }
      setBlockId(data.id)
      setTracksData(normalizeBlockData("tracks", data.content) as TracksData)
      setStatus("ready")
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const rows: TrackRow[] = []
  tracksData?.albums.forEach((album, albumIndex) => {
    if (album.isExample) return
    album.tracks.forEach((track, trackIndex) => {
      if (track.audioUrl) rows.push({ albumTitle: album.title || "Sin título", albumIndex, trackIndex, track })
    })
  })

  function rowKey(r: TrackRow) {
    return `${r.albumIndex}-${r.trackIndex}`
  }

  function setStatusFor(k: string, s: RowStatus) {
    setRowStatus((prev) => ({ ...prev, [k]: s }))
  }

  async function handleComputeHash(row: TrackRow) {
    if (!profileId || blockId === null || !tracksData) return
    const k = rowKey(row)
    setStatusFor(k, "hashing")
    try {
      const res = await fetch(row.track.audioUrl as string)
      if (!res.ok) throw new Error("No se pudo descargar el audio para calcular el hash.")
      const buffer = await res.arrayBuffer()
      const { sha256Bytes } = await import("@/lib/audio-hash")
      const fileHash = await sha256Bytes(buffer)

      const updatedAlbums = tracksData.albums.map((a, aIdx) =>
        aIdx === row.albumIndex
          ? { ...a, tracks: a.tracks.map((t, tIdx) => (tIdx === row.trackIndex ? { ...t, fileHash } : t)) }
          : a
      )

      const { error: updateError } = await supabase
        .from("profile_blocks")
        .update({ content: { albums: updatedAlbums } })
        .eq("id", blockId)
      if (updateError) throw updateError

      const { recordAuthorCertificate } = await import("@/lib/author-certificates")
      await recordAuthorCertificate(profileId, { songTitle: row.track.title || "Sin título", fileHash })

      setTracksData({ albums: updatedAlbums })
      setStatusFor(k, "idle")
    } catch (err) {
      logSupabaseError("CertificateTool: error calculando el hash", err)
      setStatusFor(k, "error")
    }
  }

  async function handleDownload(row: TrackRow) {
    if (!profileId || !row.track.fileHash) return
    const k = rowKey(row)
    setStatusFor(k, "fetching")
    try {
      const { fetchCertificateByHash } = await import("@/lib/author-certificates")
      const cert = await fetchCertificateByHash(profileId, row.track.fileHash)
      if (!cert) {
        setStatusFor(k, "not-registered")
        return
      }
      const { generateAuthorshipCertificatePdf } = await import("@/lib/generate-authorship-certificate-pdf")
      generateAuthorshipCertificatePdf({
        artistName: artistName || "—",
        songTitle: row.track.title || cert.songTitle,
        fileHash: cert.fileHash,
        registeredAt: cert.createdAt,
      })
      setStatusFor(k, "idle")
    } catch (err) {
      logSupabaseError("CertificateTool: error descargando el certificado", err)
      setStatusFor(k, "error")
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        <ShieldCheck className="size-5 text-primary" />
        Certificados de Autoría
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Marcado de tiempo por huella SHA-256: evidencia de que tenías cada pista en tu poder desde la fecha
        en que quedó registrada.
      </p>

      {!profileId && (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
          Publica tu perfil primero para poder usar esta herramienta.
        </p>
      )}

      {profileId && status === "loading" && (
        <p className="mt-4 text-xs text-muted-foreground">Cargando pistas...</p>
      )}
      {profileId && status === "error" && (
        <p className="mt-4 text-xs text-destructive">No se pudieron cargar tus pistas.</p>
      )}
      {profileId && status === "ready" && rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
          Todavía no tienes pistas propias publicadas (con audio real, sin contar los álbumes de ejemplo).
        </p>
      )}

      {profileId && status === "ready" && rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => {
            const k = rowKey(row)
            const s = rowStatus[k] ?? "idle"
            return (
              <li key={k} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2">
                  <Music className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {row.track.title || "Sin título"}
                    <span className="ml-1.5 font-normal text-muted-foreground">— {row.albumTitle}</span>
                  </p>
                </div>

                {row.track.fileHash ? (
                  <>
                    <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
                      SHA-256: {row.track.fileHash}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDownload(row)}
                      disabled={s === "fetching"}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {s === "fetching" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Descargar Certificado de Autoría
                    </button>
                    {s === "not-registered" && (
                      <p className="mt-1 text-[10px] italic text-muted-foreground">
                        Todavía no está registrado — vuelve a publicar tu perfil para fijar la fecha oficial.
                      </p>
                    )}
                    {s === "error" && (
                      <p className="mt-1 text-[10px] text-destructive">No se pudo obtener el certificado.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                      Sin huella digital calculada todavía.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleComputeHash(row)}
                      disabled={s === "hashing"}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {s === "hashing" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Fingerprint className="size-3.5" />
                      )}
                      {s === "hashing" ? "Calculando..." : "Calcular hash SHA-256"}
                    </button>
                    {s === "error" && (
                      <p className="mt-1 text-[10px] text-destructive">
                        No se pudo calcular el hash (¿el audio permite descarga desde otro origen?).
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-4 text-center text-[10px] italic text-muted-foreground">
        Evidencia de posesión previa — no reemplaza el registro oficial ante INDECOPI.
      </p>
    </div>
  )
}

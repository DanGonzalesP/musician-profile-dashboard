"use client"

import { useEffect, useRef, useState } from "react"
import { ShieldCheck, Download, Fingerprint, Loader2, Music } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { normalizeBlockData, type TracksData, type Track } from "@/lib/blocks"
import { mediaUrl } from "@/lib/media-url"
import { MAX_BYTES_BY_FOLDER } from "@/lib/upload-validation"

type TrackRow = {
  albumTitle: string
  albumIndex: number
  trackIndex: number
  track: Track
}

type RowStatus = "idle" | "hashing" | "fetching" | "error" | "not-registered"

export function CertificateTool({ profileId, artistName, ownerUserId }: { profileId: string; artistName?: string; ownerUserId: string }) {
  const [rawContent, setRawContent] = useState<unknown>(null)
  const active = useRef(false)
  const busy = useRef(false)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)
  const [blockId, setBlockId] = useState<number | null>(null)
  const [tracksData, setTracksData] = useState<TracksData | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("loading")
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})

  useEffect(() => {
    let cancelled = false
    active.current = true
    async function load() {
      try {
        const token = await accountToken()
        const { data, error } = await supabase.from("profile_blocks").select("id, content")
          .eq("profile_id", profileId).eq("block_type", "tracks").maybeSingle()
          .setHeader("Authorization", `Bearer ${token}`)
        if (cancelled) return
        if (error) throw new Error("load")
        setBlockId(data?.id ?? null)
        setRawContent(data?.content ?? null)
        setTracksData(data ? normalizeBlockData("tracks", data.content) as TracksData : { albums: [] })
        setRowStatus({})
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    }
    async function accountToken() {
      const { data, error } = await supabase.auth.getSession()
      if (error || data.session?.user.id !== ownerUserId) throw new Error("session")
      return data.session.access_token
    }
    void load()
    return () => { cancelled = true; active.current = false; request.current?.abort() }
  }, [profileId, ownerUserId, attempt])

  async function accountToken() {
    const { data, error } = await supabase.auth.getSession()
    if (error || data.session?.user.id !== ownerUserId || !active.current) throw new Error("session")
    return data.session.access_token
  }

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
    if (busy.current || !active.current || blockId === null || !rawContent) return
    busy.current = true
    const k = rowKey(row)
    setBusyRow(k)
    setStatusFor(k, "hashing")
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 120_000)
    try {
      await accountToken()
      const res = await fetch(mediaUrl(row.track.audioUrl as string), { signal: controller.signal })
      if (!res.ok) throw new Error("audio")
      const { sha256Bytes, readAudioForHash } = await import("@/lib/audio-hash")
      const buffer = await readAudioForHash(res, MAX_BYTES_BY_FOLDER.audio)
      const fileHash = await sha256Bytes(buffer)
      const token = await accountToken()
      if (controller.signal.aborted) throw new Error("cancelled")
      const { data, error } = await supabase.rpc("register_track_fingerprint", {
        p_profile_id: profileId, p_block_id: blockId, p_expected_content: rawContent,
        p_album_index: row.albumIndex, p_track_index: row.trackIndex, p_file_hash: fileHash,
      }).setHeader("Authorization", `Bearer ${token}`).abortSignal(controller.signal)
      if (error || !data) throw new Error("register")
      if (!active.current) return
      setRawContent(data)
      setTracksData(normalizeBlockData("tracks", data) as TracksData)
      setStatusFor(k, "idle")
    } catch {
      if (active.current) setStatusFor(k, "error")
    } finally {
      clearTimeout(timeout)
      request.current = null
      busy.current = false
      if (active.current) setBusyRow(null)
    }
  }

  async function handleDownload(row: TrackRow) {
    if (busy.current || !active.current || !row.track.fileHash) return
    busy.current = true
    const k = rowKey(row)
    setBusyRow(k)
    setStatusFor(k, "fetching")
    try {
      const { fetchCertificateByHash } = await import("@/lib/author-certificates")
      const cert = await fetchCertificateByHash(profileId, row.track.fileHash, ownerUserId)
      if (!active.current) return
      if (!cert) { setStatusFor(k, "not-registered"); return }
      const { generateAuthorshipCertificatePdf } = await import("@/lib/generate-authorship-certificate-pdf")
      await accountToken()
      generateAuthorshipCertificatePdf({
        artistName: artistName || "—", songTitle: row.track.title || cert.songTitle,
        fileHash: cert.fileHash, registeredAt: cert.createdAt,
      })
      setStatusFor(k, "idle")
    } catch {
      if (active.current) setStatusFor(k, "error")
    } finally {
      busy.current = false
      if (active.current) setBusyRow(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        <ShieldCheck className="size-5 text-primary" />
        Constancias de huella digital
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Consulta la huella SHA-256 declarada de cada pista y su fecha de registro en Vibe.
        Esta constancia no acredita autoría ni titularidad de derechos.
      </p>

      {!profileId && (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
          Publica tu perfil primero para poder usar esta herramienta.
        </p>
      )}

      {profileId && status === "loading" && (
        <p role="status" className="mt-4 text-xs text-muted-foreground">Cargando pistas...</p>
      )}
      {profileId && status === "error" && (
        <p role="alert" className="mt-4 text-xs text-destructive">No se pudieron cargar tus pistas.</p>
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
                      disabled={busyRow !== null}
                      className="min-h-11 mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {s === "fetching" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Descargar constancia de huella
                    </button>
                    {s === "not-registered" && (
                      <p className="mt-1 text-[10px] italic text-muted-foreground">
                        Todavía no está registrada. Vuelve a publicar tu perfil para registrar la huella en Vibe.
                      </p>
                    )}
                    {s === "error" && (
                      <p role="alert" className="mt-1 text-[10px] text-destructive">No se pudo obtener el certificado.</p>
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
                      disabled={busyRow !== null}
                      className="min-h-11 mt-2 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {s === "hashing" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Fingerprint className="size-3.5" />
                      )}
                      {s === "hashing" ? "Calculando..." : "Calcular hash SHA-256"}
                    </button>
                    {s === "error" && (
                      <p role="alert" className="mt-1 text-[10px] text-destructive">
                        No se pudo confirmar el registro. Recarga las pistas antes de intentarlo de nuevo; el contenido puede haber cambiado.
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" disabled={busyRow !== null || status === "loading"}
        className="min-h-11 mt-4 px-3 rounded border text-sm disabled:opacity-60"
        onClick={() => { setStatus("loading"); setAttempt(value => value + 1) }}>
        Recargar pistas
      </button>
      <p className="mt-4 text-center text-[10px] italic text-muted-foreground">
        Registro interno de una huella declarada. No es un registro ante INDECOPI ni un sellado de tiempo independiente.
      </p>
    </div>
  )
}

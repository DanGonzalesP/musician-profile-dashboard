"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Music, Disc3 } from "lucide-react"
import type { TracksData, Album } from "@/lib/blocks"

function AlbumCover({
  album,
  active,
  onClick,
}: {
  album: Album
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-32 shrink-0 flex-col items-center gap-2 rounded-lg p-2 text-left transition-colors ${
        active ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent/50"
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md shadow-md">
        {album.cover ? (
          <img src={album.cover} alt={album.title || "Album cover"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Music className="size-8 text-muted-foreground/40" />
          </div>
        )}
        {active && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Disc3 className="size-6 animate-spin text-white" style={{ animationDuration: "3s" }} />
          </span>
        )}
      </div>
      <p className={`w-full truncate text-center text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>
        {album.title || "Untitled Album"}
      </p>
    </button>
  )
}

export function TrackListBlock({ data }: { data: TracksData }) {
  const albums = data.albums || []
  const [selectedAlbum, setSelectedAlbum] = useState<number | null>(null)
  const [playingTrack, setPlayingTrack] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function stopAudio() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }

  function playTrackAt(albumIndex: number, trackIndex: number) {
    const track = albums[albumIndex]?.tracks[trackIndex]
    if (!track?.audioUrl) return

    stopAudio()
    const audio = new Audio(track.audioUrl)
    audioRef.current = audio
    setPlayingTrack(trackIndex)

    audio.onended = () => {
      const tracks = albums[albumIndex]?.tracks || []
      const nextIndex = tracks.findIndex((t, idx) => idx > trackIndex && Boolean(t.audioUrl))
      if (nextIndex >= 0) {
        playTrackAt(albumIndex, nextIndex)
      } else {
        audioRef.current = null
        setPlayingTrack(null)
      }
    }
    audio.onerror = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setPlayingTrack(null)
      }
    }
    audio.play().catch(() => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setPlayingTrack(null)
      }
    })
  }

  function handleSelectAlbum(index: number) {
    if (selectedAlbum === index) {
      stopAudio()
      setSelectedAlbum(null)
      setPlayingTrack(null)
      return
    }
    stopAudio()
    setSelectedAlbum(index)
    const firstPlayable = albums[index]?.tracks.findIndex((t) => Boolean(t.audioUrl)) ?? -1
    setPlayingTrack(null)
    if (firstPlayable >= 0) {
      playTrackAt(index, firstPlayable)
    }
  }

  function handleTrackClick(albumIndex: number, trackIndex: number) {
    if (selectedAlbum === albumIndex && playingTrack === trackIndex) {
      stopAudio()
      setPlayingTrack(null)
      return
    }
    playTrackAt(albumIndex, trackIndex)
  }

  useEffect(() => () => stopAudio(), [])

  const activeAlbum = selectedAlbum !== null ? albums[selectedAlbum] : null
  const activeTrack = activeAlbum && playingTrack !== null ? activeAlbum.tracks[playingTrack] : null

  if (albums.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No hay álbumes publicados todavía.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Discografía
      </div>

      {/* Carrusel de álbumes — scroll horizontal */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {albums.map((album, i) => (
          <AlbumCover key={album.id} album={album} active={selectedAlbum === i} onClick={() => handleSelectAlbum(i)} />
        ))}
      </div>

      {/* Panel del álbum seleccionado — se despliega hacia abajo */}
      {selectedAlbum !== null && activeAlbum && (
        <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>{activeAlbum.title || "Untitled Album"}</span>
            <span>
              {activeAlbum.tracks.length} {activeAlbum.tracks.length === 1 ? "canción" : "canciones"}
            </span>
          </div>

          <ul className="flex flex-col">
            {activeAlbum.tracks.map((track, i) => {
              const isPlaying = playingTrack === i
              const hasAudio = Boolean(track.audioUrl)
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => handleTrackClick(selectedAlbum, i)}
                    disabled={!hasAudio}
                    className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                      isPlaying ? "bg-primary/10" : hasAudio ? "hover:bg-accent/60" : "cursor-not-allowed opacity-60"
                    }`}
                  >
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isPlaying
                          ? "border-primary bg-primary/10 text-primary"
                          : hasAudio
                            ? "border-border text-muted-foreground group-hover:border-primary group-hover:text-primary"
                            : "border-border/50 text-muted-foreground/40"
                      }`}
                    >
                      {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </span>
                    <span className={`flex-1 truncate text-sm ${isPlaying ? "font-medium text-primary" : "text-foreground"}`}>
                      {track.title || "Nueva Pista"}
                    </span>
                    {!hasAudio && <span className="text-[10px] italic text-muted-foreground/50">sin audio</span>}
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {track.duration || "—"}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Descripción de la pista en reproducción — cambia con cada track */}
          {activeTrack?.description && (
            <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              {activeTrack.description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

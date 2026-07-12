"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Heart, Clock3, Music } from "lucide-react"
import type { TracksData } from "@/lib/blocks"

export function TrackListBlock({ data }: { data: TracksData }) {
  const [playing, setPlaying] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canciones = data.tracks || []

  function stopAudio() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }

  function playTrack(index: number) {
    const track = canciones[index]
    if (!track?.audioUrl) return

    if (playing === index && audioRef.current) {
      stopAudio()
      setPlaying(null)
      return
    }

    stopAudio()
    const audio = new Audio(track.audioUrl)
    audioRef.current = audio
    setPlaying(index)

    audio.onended = () => {
      const nextIndex = canciones.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && Boolean(candidate.audioUrl)
      )

      if (nextIndex >= 0) {
        playTrack(nextIndex)
      } else {
        audioRef.current = null
        setPlaying(null)
      }
    }
    audio.onerror = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setPlaying(null)
      }
    }
    audio.play().catch(() => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setPlaying(null)
      }
    })
  }

  useEffect(() => () => stopAudio(), [])

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-4 sm:w-56 sm:shrink-0">
          {data.cover ? (
            <img
              src={data.cover}
              alt="Album cover"
              className="aspect-square w-full max-w-56 rounded-lg object-cover shadow-lg"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 shadow-inner">
              <Music className="size-12 text-muted-foreground/40" />
            </div>
          )}
          <div className="w-full text-center">
            <p className="text-sm font-semibold text-foreground">{data.title || "Lanzamientos Recientes"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canciones.length} {canciones.length === 1 ? "canción" : "canciones"}
            </p>
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Track</span>
            <Clock3 className="size-3.5" />
          </div>
          <ul className="flex flex-col">
            {canciones.map((track, i) => {
              const isPlaying = playing === i
              const hasAudio = Boolean(track.audioUrl)
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => playTrack(i)}
                    disabled={!hasAudio}
                    className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                      isPlaying
                        ? "bg-primary/10"
                        : hasAudio
                          ? "hover:bg-accent/60"
                          : "cursor-not-allowed opacity-60"
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
                    <Heart className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {track.duration || "—"}
                    </span>
                  </button>
                </li>
              )
            })}
            {canciones.length === 0 && (
              <p className="py-2 text-xs italic text-muted-foreground">No hay pistas de audio disponibles.</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Play, Pause, Heart, Clock3 } from "lucide-react"
import type { TracksData } from "@/lib/blocks"
import { supabase } from "@/lib/supabase"

interface DbTrack {
  id: number
  title: string
  duration: string
}

export function TrackListBlock({ data }: { data: TracksData }) {
  const [playing, setPlaying] = useState<number | null>(0)
  const [canciones, setCanciones] = useState<DbTrack[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function obtenerCanciones() {
      // 1. Obtener ID del artista Nova Reyes
      const { data: artist } = await supabase
        .from("artist")
        .select("id")
        .eq("username", "novareyes")
        .single()

      if (artist) {
        // 2. Traer canciones de la tabla tracks vinculadas al ID del artista
        const { data: tracksData } = await supabase
          .from("tracks")
          .select("id, title, duration")
          .eq("artist_id", artist.id)

        if (tracksData) {
          setCanciones(tracksData as DbTrack[])
        }
      }
      setLoading(false)
    }

    obtenerCanciones()
  }, [])

  if (loading) {
    return <div className="p-4 text-xs text-center text-muted-foreground">Cargando reproductor...</div>
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-4 sm:w-56 sm:shrink-0">
          <img
            src={data.cover || "/placeholder.svg"}
            alt="Album cover"
            className="aspect-square w-full max-w-56 rounded-lg object-cover shadow-lg"
          />
          <div className="w-full text-center">
            <p className="text-sm font-semibold text-foreground">{data.title || "Lanzamientos Recientes"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{canciones.length} canciones</p>
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
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => setPlaying(isPlaying ? null : i)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                      isPlaying ? "bg-primary/10" : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground group-hover:border-primary group-hover:text-primary">
                      {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </span>
                    <span
                      className={`flex-1 truncate text-sm ${
                        isPlaying ? "font-medium text-primary" : "text-foreground"
                      }`}
                    >
                      {track.title}
                    </span>
                    <Heart className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {track.duration || "3:30"}
                    </span>
                  </button>
                </li>
              )
            })}
            {canciones.length === 0 && (
              <p className="text-xs italic text-muted-foreground py-2">No hay pistas de audio disponibles.</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
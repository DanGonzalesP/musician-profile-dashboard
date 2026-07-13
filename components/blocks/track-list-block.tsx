"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Music } from "lucide-react"
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
        {album.isExample && (
          <span className="absolute left-1 top-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">
            Ejemplo
          </span>
        )}
      </div>
      <p className={`w-full truncate text-center text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>
        {album.title || "Untitled Album"}
      </p>
    </button>
  )
}

const ALBUM_ITEM_WIDTH = 128 // w-32
const ALBUM_ITEM_GAP = 12 // gap-3

export function TrackListBlock({ data }: { data: TracksData }) {
  const albums = data.albums || []
  // selectedAlbum: cuál álbum debe estar en la posición izquierda del carrusel.
  // panelAlbumIndex: cuál álbum tiene su panel/vinilo realmente desplegado.
  // Van desfasados a propósito para poder secuenciar: retraer → deslizar → desplegar.
  const [selectedAlbum, setSelectedAlbum] = useState<number | null>(null)
  const [panelAlbumIndex, setPanelAlbumIndex] = useState<number | null>(null)
  const [playingTrack, setPlayingTrack] = useState<number | null>(null)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [isClosingPanel, setIsClosingPanel] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopAudio() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }

  // El carrusel se pausa mientras el usuario interactúa y se reanuda solo
  // unos segundos después — nunca se queda detenido para siempre.
  function pauseCarouselBriefly() {
    setCarouselPaused(true)
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = setTimeout(() => setCarouselPaused(false), 2500)
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

  function dropVinylFor(index: number) {
    setPanelAlbumIndex(index)
    const firstPlayable = albums[index]?.tracks.findIndex((t) => Boolean(t.audioUrl)) ?? -1
    setPlayingTrack(null)
    if (firstPlayable >= 0) {
      playTrackAt(index, firstPlayable)
    }
  }

  function handleSelectAlbum(index: number) {
    pauseCarouselBriefly()

    if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current)
    if (slideTimeoutRef.current) clearTimeout(slideTimeoutRef.current)

    if (selectedAlbum === index && panelAlbumIndex === index) {
      stopAudio()
      setPlayingTrack(null)
      setPanelAlbumIndex(null)
      setSelectedAlbum(null)
      return
    }

    stopAudio()
    setPlayingTrack(null)

    if (panelAlbumIndex !== null) {
      // 1. El vinilo actual se guarda por completo dentro de su portada.
      setIsClosingPanel(true)
      switchTimeoutRef.current = setTimeout(() => {
        setIsClosingPanel(false)
        setPanelAlbumIndex(null)
        // 2. Recién ahí el álbum nuevo se desliza a la primera posición.
        setSelectedAlbum(index)
        // 3. Y solo cuando termina de deslizarse, baja su propio vinilo.
        slideTimeoutRef.current = setTimeout(() => dropVinylFor(index), 500)
      }, 280)
      return
    }

    setSelectedAlbum(index)
    slideTimeoutRef.current = setTimeout(() => dropVinylFor(index), 500)
  }

  function handleTrackClick(albumIndex: number, trackIndex: number) {
    pauseCarouselBriefly()
    if (panelAlbumIndex === albumIndex && playingTrack === trackIndex) {
      stopAudio()
      setPlayingTrack(null)
      return
    }
    playTrackAt(albumIndex, trackIndex)
  }

  useEffect(
    () => () => {
      stopAudio()
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
      if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current)
      if (slideTimeoutRef.current) clearTimeout(slideTimeoutRef.current)
    },
    []
  )

  const activeAlbum = panelAlbumIndex !== null ? albums[panelAlbumIndex] : null
  const activeTrack = activeAlbum && playingTrack !== null ? activeAlbum.tracks[playingTrack] : null

  if (albums.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No hay álbumes publicados todavía.
      </div>
    )
  }

  // Se duplica la lista para lograr un loop continuo sin salto visible:
  // al desplazar exactamente -50% del ancho total, la segunda copia calza
  // en el lugar de la primera y el ciclo se reinicia sin corte.
  const loopAlbums = albums.length > 1 ? [...albums, ...albums] : albums
  const cycleSeconds = Math.max(albums.length * 4, 8)

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Discografía
      </div>

      {/* Carrusel infinito de álbumes */}
      <div
        className="-mx-1 overflow-hidden px-1 pb-2"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
      >
        <div
          className={`flex w-max gap-3 ${selectedAlbum === null ? "animate-marquee" : ""}`}
          style={
            selectedAlbum === null
              ? { animationDuration: `${cycleSeconds}s`, animationPlayState: carouselPaused ? "paused" : "running" }
              : {
                  transform: `translateX(-${selectedAlbum * (ALBUM_ITEM_WIDTH + ALBUM_ITEM_GAP)}px)`,
                  transition: "transform 500ms ease",
                }
          }
        >
          {loopAlbums.map((album, i) => (
            <AlbumCover
              key={`${album.id}-${i}`}
              album={album}
              active={selectedAlbum === i % albums.length}
              onClick={() => handleSelectAlbum(i % albums.length)}
            />
          ))}
        </div>
      </div>

      {/* Panel del álbum seleccionado — vinilo + pistas arriba, descripción abajo a todo el ancho */}
      {panelAlbumIndex !== null && activeAlbum && (
        <div
          className={`mt-4 rounded-lg border border-border bg-background/40 p-4 ${
            isClosingPanel ? "animate-vinyl-retract" : "animate-vinyl-drop"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* El vinilo mide exactamente lo mismo que la portada en el carrusel (w-32 = 128px) */}
            <div className="flex w-32 shrink-0 items-center justify-center">
              <div
                className={`relative aspect-square w-32 shrink-0 overflow-hidden rounded-full shadow-2xl ${
                  playingTrack !== null ? "animate-spin" : ""
                }`}
                style={{
                  animationDuration: "6s",
                  background: "repeating-radial-gradient(circle, #111 0px, #111 6px, #262626 7px, #111 8px)",
                }}
              >
                <img
                  src={activeAlbum.cover || "/album-1.png"}
                  alt=""
                  className="absolute inset-0 m-auto size-14 rounded-full border-2 border-black/70 object-cover"
                />
              </div>
            </div>

            <div className="min-w-0 flex-1">
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
                        onClick={() => handleTrackClick(panelAlbumIndex, i)}
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
            </div>
          </div>

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

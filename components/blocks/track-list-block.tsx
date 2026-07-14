"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Music } from "lucide-react"
import type { TracksData, Album } from "@/lib/blocks"
import { setActiveAudio } from "@/lib/audio-bus"
import { useLocale } from "@/components/locale-provider"

function AlbumCover({
  album,
  active,
  onClick,
}: {
  album: Album
  active: boolean
  onClick: () => void
}) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-48 shrink-0 flex-col items-center gap-2 rounded-lg p-2 text-left transition-colors ${
        active ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent/50"
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md shadow-md">
        {album.cover ? (
          <img src={album.cover} alt={album.title || t("album_cover_alt")} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Music className="size-8 text-muted-foreground/40" />
          </div>
        )}
        {album.isExample && (
          <span className="absolute left-1 top-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">
            {t("example_badge")}
          </span>
        )}
      </div>
      <p className={`w-full truncate text-center text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>
        {album.title || t("album_untitled")}
      </p>
    </button>
  )
}

const ALBUM_ITEM_WIDTH = 192 // w-48
const ALBUM_ITEM_GAP = 12 // gap-3

function TypewriterText({ text }: { text: string }) {
  const [visibleChars, setVisibleChars] = useState(0)

  useEffect(() => {
    setVisibleChars(0)
    if (!text) return
    const interval = setInterval(() => {
      setVisibleChars((prev) => {
        if (prev >= text.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 16)
    return () => clearInterval(interval)
  }, [text])

  return <>{text.slice(0, visibleChars)}</>
}

export function TrackListBlock({ data }: { data: TracksData }) {
  const { t } = useLocale()
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
  // Guarda qué audioUrl quedó realmente cargado en audioRef — no solo el
  // índice de la pista. Si el artista sube un archivo nuevo para la misma
  // posición mientras el panel sigue abierto, el índice no cambia, así que
  // sin esta referencia el siguiente clic en Play creía que "ya estaba
  // sonando esa pista" y solo la detenía en vez de cargar el archivo nuevo.
  const loadedUrlRef = useRef<string | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopAudio() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
    loadedUrlRef.current = null
    setActiveAudio(null)
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
    let fallbackTried = false

    // Se intenta primero con crossOrigin habilitado (necesario para que el
    // fondo audio-reactivo pueda leer las frecuencias). Si el host del audio
    // no soporta CORS, la carga falla por completo (no solo el análisis) —
    // en ese caso se reintenta UNA vez sin crossOrigin para no romper la
    // reproducción; esa pista simplemente no alimentará el fondo reactivo.
    function createAndPlay(withCors: boolean) {
      const audio = new Audio()
      if (withCors) audio.crossOrigin = "anonymous"
      audio.src = track!.audioUrl!
      audioRef.current = audio
      loadedUrlRef.current = track!.audioUrl!
      setPlayingTrack(trackIndex)
      if (withCors) setActiveAudio(audio)

      function giveUp() {
        if (audioRef.current === audio) {
          audioRef.current = null
          loadedUrlRef.current = null
          setPlayingTrack(null)
          setActiveAudio(null)
        }
      }

      function retryOrGiveUp() {
        if (withCors && !fallbackTried) {
          fallbackTried = true
          createAndPlay(false)
          return
        }
        giveUp()
      }

      audio.onended = () => {
        const tracks = albums[albumIndex]?.tracks || []
        const nextIndex = tracks.findIndex((t, idx) => idx > trackIndex && Boolean(t.audioUrl))
        if (nextIndex >= 0) {
          playTrackAt(albumIndex, nextIndex)
        } else {
          audioRef.current = null
          loadedUrlRef.current = null
          setPlayingTrack(null)
          setActiveAudio(null)
        }
      }
      audio.onerror = retryOrGiveUp
      audio.play().catch(retryOrGiveUp)
    }

    createAndPlay(true)
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

    if (panelAlbumIndex === index) {
      // Mismo álbum: el vinilo se guarda en su funda y el panel recién
      // entonces se cierra por completo.
      stopAudio()
      setPlayingTrack(null)
      setIsClosingPanel(true)
      switchTimeoutRef.current = setTimeout(() => {
        setIsClosingPanel(false)
        setPanelAlbumIndex(null)
        setSelectedAlbum(null)
      }, 280)
      return
    }

    stopAudio()
    setPlayingTrack(null)

    if (panelAlbumIndex !== null) {
      // El panel (la caja completa) no se mueve ni desaparece — solo el
      // vinilo: 1) se guarda en su funda, 2) el álbum nuevo se desliza a la
      // primera posición, 3) recién ahí baja su propio vinilo.
      setIsClosingPanel(true)
      switchTimeoutRef.current = setTimeout(() => {
        setSelectedAlbum(index)
        slideTimeoutRef.current = setTimeout(() => {
          setIsClosingPanel(false)
          dropVinylFor(index)
        }, 500)
      }, 280)
      return
    }

    setSelectedAlbum(index)
    slideTimeoutRef.current = setTimeout(() => dropVinylFor(index), 500)
  }

  function handleTrackClick(albumIndex: number, trackIndex: number) {
    pauseCarouselBriefly()
    const track = albums[albumIndex]?.tracks[trackIndex]
    // Solo se trata como "pausar la pista que ya suena" si el archivo
    // realmente cargado coincide con el audioUrl actual de esa posición.
    // Si el artista reemplazó el audio de esa pista, el índice sigue siendo
    // el mismo pero el archivo cargado ya no coincide — en ese caso el clic
    // debe cargar y reproducir el archivo nuevo, no solo detener el viejo.
    const isSameLoadedTrack =
      panelAlbumIndex === albumIndex &&
      playingTrack === trackIndex &&
      loadedUrlRef.current === track?.audioUrl
    if (isSameLoadedTrack) {
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
        {t("discography_empty")}
      </div>
    )
  }

  // Con pocos álbumes, una sola copia puede ser más angosta que el
  // contenedor: al desplazar -50% del ancho total, la ventana visible queda
  // parcialmente fuera del track y se ve "vacío". Se repite la lista las
  // veces necesarias para que un solo set siempre cubra un ancho generoso,
  // y se traslada por -(100/repeticiones)% en vez de un -50% fijo.
  const singleSetWidth = albums.length * (ALBUM_ITEM_WIDTH + ALBUM_ITEM_GAP)
  const repeatCount = Math.max(2, Math.ceil(1600 / Math.max(singleSetWidth, 1)) + 1)
  const loopAlbums = Array.from({ length: repeatCount }, () => albums).flat()
  const marqueeShiftPercent = 100 / repeatCount
  const cycleSeconds = Math.max(albums.length * 4, 8)

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("discography_title")}
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
              ? ({
                  animationDuration: `${cycleSeconds}s`,
                  animationPlayState: carouselPaused ? "paused" : "running",
                  "--marquee-shift": `${marqueeShiftPercent}%`,
                } as React.CSSProperties)
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
        <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* El vinilo mide exactamente lo mismo que la portada en el carrusel (w-48 = 192px):
                solo él se desliza al abrir/cambiar de álbum, el panel no se mueve. */}
            <div className="flex w-48 shrink-0 items-center justify-center overflow-hidden">
              <div
                className={`aspect-square w-48 shrink-0 overflow-hidden rounded-full shadow-2xl ${
                  isClosingPanel ? "animate-vinyl-retract" : "animate-vinyl-drop"
                }`}
              >
                <div
                  className={`flex h-full w-full items-center justify-center ${
                    playingTrack !== null && !isClosingPanel ? "animate-spin" : ""
                  }`}
                  style={{
                    animationDuration: "6s",
                    background: "repeating-radial-gradient(circle, #111 0px, #111 6px, #262626 7px, #111 8px)",
                  }}
                >
                  <img
                    src={activeAlbum.cover || "/album-1.png"}
                    alt=""
                    className="size-14 rounded-full border-2 border-black/70 object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>{activeAlbum.title || t("album_untitled")}</span>
                <span>
                  {activeAlbum.tracks.length} {t(activeAlbum.tracks.length === 1 ? "song_one" : "song_other")}
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
                        <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                          {track.image || activeAlbum.cover ? (
                            <img
                              src={track.image || activeAlbum.cover}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center">
                              <Music className="size-4 text-muted-foreground/40" />
                            </span>
                          )}
                        </span>
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
                          {track.title || t("track_untitled")}
                        </span>
                        {!hasAudio && <span className="text-[10px] italic text-muted-foreground/50">{t("track_no_audio")}</span>}
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
              <TypewriterText key={`${panelAlbumIndex}-${playingTrack}`} text={activeTrack.description} />
            </p>
          )}
        </div>
      )}
    </div>
  )
}

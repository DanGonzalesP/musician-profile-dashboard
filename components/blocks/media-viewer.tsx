"use client"

// Media Viewer inmersivo tipo TikTok para el bloque Publicaciones: pantalla
// completa, navegación vertical entre publicaciones con swipe/rueda/flechas
// y transiciones elásticas (springs de framer-motion con rebote). Los videos
// se reproducen solos al quedar activos, con barra de progreso y control de
// sonido; la barra lateral derecha trae me gusta y compartir, como TikTok.

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronDown, ChevronUp, Heart, Link2, Pause, Play, Share2, Volume2, VolumeX, X } from "lucide-react"
import type { PublicacionItem } from "@/lib/blocks"

const SWIPE_DISTANCE = 80
const SWIPE_VELOCITY = 500

export function MediaViewer({
  items,
  startIndex,
  onClose,
}: {
  items: PublicacionItem[]
  startIndex: number
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), items.length - 1))
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [shareFeedback, setShareFeedback] = useState(false)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const wheelLockRef = useRef(false)

  const current = items[index]

  const goTo = useCallback(
    (next: number) => {
      setIndex((prev) => {
        const clamped = Math.min(Math.max(next, 0), items.length - 1)
        if (clamped !== prev) {
          setPaused(false)
          setProgress(0)
        }
        return clamped
      })
    },
    [items.length]
  )

  // Teclado: flechas para navegar, Escape para cerrar.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowDown") goTo(index + 1)
      if (e.key === "ArrowUp") goTo(index - 1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [index, goTo, onClose])

  // Bloquear el scroll del documento mientras el visor está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Reproducir solo el video activo; pausar el resto. Si el navegador
  // bloquea el autoplay con sonido, se reintenta silenciado.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (i === index && current?.type === "video" && !paused) {
        video.play().catch(() => {
          video.muted = true
          setMuted(true)
          video.play().catch(() => {})
        })
      } else {
        video.pause()
        if (i !== index) video.currentTime = 0
      }
    })
  }, [index, paused, current?.type])

  const toggleLike = () => {
    if (!current) return
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(current.id)) next.delete(current.id)
      else next.add(current.id)
      return next
    })
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: current?.caption || "Publicación", url })
        return
      }
      throw new Error("share no disponible")
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        setShareFeedback(true)
        setTimeout(() => setShareFeedback(false), 1600)
      } catch {
        // Sin clipboard tampoco: no hay nada más que hacer.
      }
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelLockRef.current || Math.abs(e.deltaY) < 24) return
    wheelLockRef.current = true
    goTo(index + (e.deltaY > 0 ? 1 : -1))
    setTimeout(() => {
      wheelLockRef.current = false
    }, 450)
  }

  const isLiked = current ? likedIds.has(current.id) : false

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onWheel={handleWheel}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de publicaciones"
    >
      {/* Contenedor central con proporción vertical tipo TikTok */}
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 48 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 32 }}
        transition={{ type: "spring", stiffness: 320, damping: 24, mass: 0.9 }}
        className="relative h-full max-h-dvh w-full overflow-hidden bg-black sm:h-[92dvh] sm:w-auto sm:aspect-[9/16] sm:rounded-3xl sm:border sm:border-white/10"
      >
        {/* Capa arrastrable: vuelve a 0 (constraints) y decide el cambio de
            página según distancia/velocidad — el rebote elástico lo da el
            dragElastic + el spring del pager de abajo. */}
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.32}
          onDragEnd={(_, info) => {
            if (info.offset.y < -SWIPE_DISTANCE || info.velocity.y < -SWIPE_VELOCITY) goTo(index + 1)
            else if (info.offset.y > SWIPE_DISTANCE || info.velocity.y > SWIPE_VELOCITY) goTo(index - 1)
          }}
          className="h-full w-full"
        >
          {/* Pager vertical con spring elástico */}
          <motion.div
            animate={{ y: `-${index * 100}%` }}
            transition={
              reduceMotion
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 260, damping: 26, mass: 0.9 }
            }
            className="h-full w-full"
          >
            {items.map((item, i) => (
              <div key={item.id} className="flex h-full w-full items-center justify-center">
                {!item.url ? (
                  <div
                    aria-hidden="true"
                    className="size-full bg-gradient-to-br from-card via-background to-black"
                  />
                ) : item.type === "video" ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(i, el)
                      else videoRefs.current.delete(i)
                    }}
                    src={item.url}
                    poster={item.thumbnail || undefined}
                    loop
                    playsInline
                    muted={muted}
                    onTimeUpdate={(e) => {
                      if (i !== index) return
                      const v = e.currentTarget
                      setProgress(v.duration ? v.currentTime / v.duration : 0)
                    }}
                    onClick={() => setPaused((p) => !p)}
                    className="h-full w-full cursor-pointer object-contain"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={item.caption || "Publicación"}
                    draggable={false}
                    className="h-full w-full select-none object-contain"
                  />
                )}
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Indicador de pausa al tocar el video */}
        {current?.type === "video" && paused && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            onClick={() => setPaused(false)}
            aria-label="Reanudar video"
            className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          >
            <Play className="size-7 translate-x-0.5 fill-current" />
          </motion.button>
        )}

        {/* Degradados de legibilidad */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Barra superior: contador + cerrar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Barra lateral derecha de acciones — como TikTok */}
        <div className="absolute bottom-20 right-3 flex flex-col items-center gap-5">
          <button
            type="button"
            onClick={toggleLike}
            aria-label={isLiked ? "Quitar me gusta" : "Me gusta"}
            aria-pressed={isLiked}
            className="group flex flex-col items-center gap-1 text-white"
          >
            <motion.span
              key={`${current?.id}-${isLiked}`}
              initial={{ scale: isLiked ? 0.6 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className={`flex size-11 items-center justify-center rounded-full backdrop-blur transition-colors ${
                isLiked ? "bg-primary/90 text-white" : "bg-white/10 group-hover:bg-white/20"
              }`}
            >
              <Heart className={`size-5 ${isLiked ? "fill-current" : ""}`} />
            </motion.span>
            <span className="text-[10px] font-semibold">Me gusta</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Compartir"
            className="group flex flex-col items-center gap-1 text-white"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors group-hover:bg-white/20">
              {shareFeedback ? <Link2 className="size-5 text-primary" /> : <Share2 className="size-5" />}
            </span>
            <span className="text-[10px] font-semibold">{shareFeedback ? "¡Copiado!" : "Compartir"}</span>
          </button>

          {current?.type === "video" && (
            <>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Activar sonido" : "Silenciar"}
                className="group flex flex-col items-center gap-1 text-white"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors group-hover:bg-white/20">
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </span>
                <span className="text-[10px] font-semibold">{muted ? "Sonido" : "Silencio"}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Reproducir" : "Pausar"}
                className="group flex flex-col items-center gap-1 text-white"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors group-hover:bg-white/20">
                  {paused ? <Play className="size-5 translate-x-px fill-current" /> : <Pause className="size-5 fill-current" />}
                </span>
              </button>
            </>
          )}
        </div>

        {/* Flechas de navegación (desktop) */}
        <div className="absolute right-3 top-16 hidden flex-col gap-2 sm:flex">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Publicación anterior"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronUp className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === items.length - 1}
            aria-label="Siguiente publicación"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronDown className="size-5" />
          </button>
        </div>

        {/* Caption + progreso */}
        <div className="absolute inset-x-0 bottom-0 p-4 pr-20">
          {current?.caption && (
            <motion.p
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-sm leading-snug text-white drop-shadow"
            >
              {current.caption}
            </motion.p>
          )}
          {current?.type === "video" && (
            <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

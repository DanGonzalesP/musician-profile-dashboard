"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { GalleryHorizontalEnd, Play, X } from "lucide-react"
import { PUBLICACIONES_MAX_ITEMS, type PublicacionesData, type PublicacionItem } from "@/lib/blocks"

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
}

const tileVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
}

export function PublicacionesBlock({ data }: { data: PublicacionesData }) {
  const items = data.items.slice(0, PUBLICACIONES_MAX_ITEMS)
  const [lightboxItem, setLightboxItem] = useState<PublicacionItem | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    if (!lightboxItem) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxItem(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [lightboxItem])

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <GalleryHorizontalEnd className="size-3.5" />
        PUBLICACIONES
      </span>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Todavía no hay publicaciones.
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {items.map((item) => (
            <motion.div key={item.id} variants={tileVariants}>
              <PublicacionTile
                item={item}
                isPlaying={playingId === item.id}
                onPlay={() => setPlayingId(item.id)}
                onOpenLightbox={() => setLightboxItem(item)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          onClick={() => setLightboxItem(null)}
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setLightboxItem(null)}
            className="absolute right-4 top-4 rounded-full border border-border bg-card/60 p-2 text-foreground transition-colors hover:bg-card"
          >
            <X className="size-5" />
          </button>
          <img
            src={lightboxItem.url}
            alt={lightboxItem.caption ?? "Publicación"}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}

function PublicacionTile({
  item,
  isPlaying,
  onPlay,
  onOpenLightbox,
}: {
  item: PublicacionItem
  isPlaying: boolean
  onPlay: () => void
  onOpenLightbox: () => void
}) {
  if (item.type === "image") {
    return (
      <button
        type="button"
        onClick={onOpenLightbox}
        className="group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-card/60 text-left transition-shadow hover:shadow-[0_0_0_1px_rgba(255,0,60,0.35)]"
      >
        <img
          src={item.url}
          alt={item.caption ?? "Publicación"}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {item.caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-3">
            <p className="line-clamp-2 text-xs text-foreground sm:text-sm">{item.caption}</p>
          </div>
        )}
      </button>
    )
  }

  if (isPlaying) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-black">
        <video
          src={item.url}
          controls
          autoPlay
          className="size-full object-cover"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-card/60 text-left transition-shadow hover:shadow-[0_0_0_1px_rgba(255,0,60,0.35)]"
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.caption ?? "Video"}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="size-full bg-gradient-to-br from-card via-background to-black" />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-background/20 transition-colors group-hover:bg-background/30">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition-transform group-hover:scale-110 sm:size-12">
          <Play className="size-5 translate-x-0.5 fill-current sm:size-6" />
        </span>
      </div>
      {item.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-3">
          <p className="line-clamp-2 text-xs text-foreground sm:text-sm">{item.caption}</p>
        </div>
      )}
    </button>
  )
}

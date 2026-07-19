"use client"

// Publicaciones — 3 filas tipo carrusel, cada una con su subtítulo editable
// y hasta 3 publicaciones (fotos/videos) en el tier gratuito. Tocar
// cualquier publicación abre el Media Viewer inmersivo tipo TikTok
// (media-viewer.tsx) posicionado en ese elemento.

import { useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, GalleryHorizontalEnd, Music2, Play, PlayCircle } from "lucide-react"
import { getYoutubeEmbedUrl } from "@/lib/youtube"
import {
  PUBLICACIONES_DEFAULT_ROW_TITLES,
  PUBLICACIONES_ROWS,
  type EmbedItem,
  type PublicacionesData,
  type PublicacionItem,
} from "@/lib/blocks"
import { MediaViewer } from "./media-viewer"

const tileVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
}

type RowData = { title: string; items: { item: PublicacionItem; globalIndex: number }[] }

export function PublicacionesBlock({ data }: { data: PublicacionesData }) {
  const items = data.items
  const embeds = data.embeds ?? []
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // Reparte las publicaciones en PUBLICACIONES_ROWS filas consecutivas.
  // Con el tope gratuito de 9 son 3 filas de 3; los perfiles de grupo (sin
  // tope) reparten en 3 filas de igual tamaño.
  const rows = useMemo<RowData[]>(() => {
    const rowSize = Math.max(3, Math.ceil(items.length / PUBLICACIONES_ROWS))
    const titles = data.rowTitles?.length ? data.rowTitles : PUBLICACIONES_DEFAULT_ROW_TITLES
    return Array.from({ length: PUBLICACIONES_ROWS }, (_, rowIndex) => ({
      title: titles[rowIndex] ?? PUBLICACIONES_DEFAULT_ROW_TITLES[rowIndex] ?? "",
      items: items
        .slice(rowIndex * rowSize, (rowIndex + 1) * rowSize)
        .map((item, i) => ({ item, globalIndex: rowIndex * rowSize + i })),
    })).filter((row) => row.items.length > 0)
  }, [items, data.rowTitles])

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <GalleryHorizontalEnd className="size-3.5" />
        PUBLICACIONES
      </span>

      {items.length === 0 && embeds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Todavía no hay publicaciones.
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {rows.map((row, rowIndex) => (
            <CarouselRow
              key={rowIndex}
              row={row}
              rowIndex={rowIndex}
              onOpen={(globalIndex) => setViewerIndex(globalIndex)}
            />
          ))}
          {embeds.length > 0 && <EmbedsRows embeds={embeds} startNumber={rows.length + 1} />}
        </div>
      )}

      {/* Sin AnimatePresence a propósito: el cierre desmonta al instante
          (la animación de entrada vive dentro del propio MediaViewer). Si el
          navegador congela rAF —pestaña en segundo plano—, una animación de
          salida pendiente dejaría el visor pegado en pantalla. */}
      {viewerIndex !== null && (
        <MediaViewer items={items} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Embeds (YouTube/TikTok) — viven dentro de Publicaciones, como filas extra
// numeradas que continúan las de fotos/videos. Son una sola sección.
// ---------------------------------------------------------------------------

const embedVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
}

function EmbedsRows({ embeds, startNumber }: { embeds: EmbedItem[]; startNumber: number }) {
  const youtubeItems = embeds
    .filter((item) => item.platform === "youtube")
    .map((item) => ({ item, embedUrl: getYoutubeEmbedUrl(item.url) }))
    .filter((entry): entry is { item: EmbedItem; embedUrl: string } => entry.embedUrl !== null)
  const tiktokItems = embeds.filter((item) => item.platform === "tiktok")

  let number = startNumber

  return (
    <>
      {youtubeItems.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-baseline gap-2.5">
            <span aria-hidden="true" className="font-display text-lg font-bold text-primary/50">
              {String(number++).padStart(2, "0")}
            </span>
            <span className="flex items-center gap-1.5 font-display text-base font-bold text-foreground sm:text-lg">
              <PlayCircle className="size-4 text-primary" /> Videos
            </span>
          </h3>
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {youtubeItems.map(({ item, embedUrl }) => (
              <motion.div key={item.id} variants={embedVariants}>
                <div className="overflow-hidden rounded-xl border border-border bg-card/60">
                  <div className="aspect-video w-full">
                    <iframe
                      src={embedUrl}
                      className="size-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={item.title ?? "Video de YouTube"}
                    />
                  </div>
                  {item.title && <p className="px-3 py-2.5 text-sm font-medium text-foreground">{item.title}</p>}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}

      {tiktokItems.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-baseline gap-2.5">
            <span aria-hidden="true" className="font-display text-lg font-bold text-primary/50">
              {String(number++).padStart(2, "0")}
            </span>
            <span className="flex items-center gap-1.5 font-display text-base font-bold text-foreground sm:text-lg">
              <Music2 className="size-4 text-primary" /> TikTok
            </span>
          </h3>
          <motion.div
            className="flex flex-wrap gap-4"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {tiktokItems.map((item) => (
              <motion.div key={item.id} variants={embedVariants}>
                <div className="flex w-48 shrink-0 flex-col gap-2 sm:w-56">
                  <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-card/60">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.title ?? "Clip de TikTok"} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-gradient-to-br from-card via-background to-black">
                        <Music2 className="size-10 text-primary/80" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-background/95 via-background/40 to-transparent p-3">
                      {item.title && <p className="line-clamp-2 text-xs font-medium text-foreground">{item.title}</p>}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
                      >
                        Ver en TikTok
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Fila carrusel con subtítulo
// ---------------------------------------------------------------------------

function CarouselRow({
  row,
  rowIndex,
  onOpen,
}: {
  row: RowData
  rowIndex: number
  onOpen: (globalIndex: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScroll, setCanScroll] = useState({ left: false, right: false })

  const updateScrollState = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScroll({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    })
  }

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-baseline gap-2.5">
          <span aria-hidden="true" className="font-display text-lg font-bold text-primary/50">
            {String(rowIndex + 1).padStart(2, "0")}
          </span>
          <span className="font-display text-base font-bold text-foreground sm:text-lg">{row.title}</span>
        </h3>
        <div className="hidden gap-1.5 sm:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canScroll.left}
            aria-label={`${row.title}: anteriores`}
            className="flex size-7 items-center justify-center rounded-full border border-border bg-card/70 text-foreground transition-colors hover:bg-accent/60 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canScroll.right}
            aria-label={`${row.title}: siguientes`}
            className="flex size-7 items-center justify-center rounded-full border border-border bg-card/70 text-foreground transition-colors hover:bg-accent/60 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <motion.div
        ref={(el) => {
          scrollRef.current = el
          if (el) requestAnimationFrame(updateScrollState)
        }}
        onScroll={updateScrollState}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
        style={{ scrollbarWidth: "none" }}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
      >
        {row.items.map(({ item, globalIndex }) => (
          <motion.div
            key={item.id}
            variants={tileVariants}
            className="w-44 flex-none snap-start sm:w-[calc((100%-2rem)/3)]"
          >
            <PublicacionTile item={item} onOpen={() => onOpen(globalIndex)} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta de publicación — formato vertical 3:4; todo abre el Media Viewer
// ---------------------------------------------------------------------------

function PublicacionTile({ item, onOpen }: { item: PublicacionItem; onOpen: () => void }) {
  const preview = item.type === "video" ? item.thumbnail : item.url

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-card/60 text-left transition-shadow hover:shadow-[0_0_0_1px_var(--primary),0_16px_40px_-20px_var(--primary)]"
    >
      {preview ? (
        <img
          src={preview}
          alt={item.caption ?? (item.type === "video" ? "Video" : "Publicación")}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : item.type === "video" ? (
        // Sin miniatura propia: el primer frame del video como vista previa.
        <video src={item.url} muted playsInline preload="metadata" className="size-full object-cover" />
      ) : (
        <div className="size-full bg-gradient-to-br from-card via-background to-black" />
      )}

      {item.type === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-transform duration-300 group-hover:scale-110 sm:size-12">
            <Play className="size-5 translate-x-0.5 fill-current sm:size-6" />
          </span>
        </span>
      )}

      <div
        aria-hidden={!item.caption}
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-3"
      >
        {item.caption && <p className="line-clamp-2 text-xs text-foreground sm:text-sm">{item.caption}</p>}
      </div>
    </button>
  )
}

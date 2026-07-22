"use client"

// Publicaciones — 3 filas tipo carrusel, cada una con su subtítulo editable
// y hasta 3 publicaciones (fotos/videos) en el tier gratuito. Tocar
// cualquier publicación abre el Media Viewer inmersivo tipo TikTok
// (media-viewer.tsx) posicionado en ese elemento.

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { GalleryHorizontalEnd, Maximize2, Music2, Play, PlayCircle, X } from "lucide-react"
import { getYoutubeEmbedUrl } from "@/lib/youtube"
import {
  computePublicacionRows,
  PUBLICACIONES_DEFAULT_ROW_TITLES,
  PUBLICACIONES_ROWS,
  type EmbedItem,
  type PublicacionesData,
  type PublicacionItem,
} from "@/lib/blocks"
import { MediaViewer } from "./media-viewer"

type RowData = { title: string; items: { item: PublicacionItem; globalIndex: number }[] }

export function PublicacionesBlock({ data }: { data: PublicacionesData }) {
  const items = data.items
  const embeds = data.embeds ?? []
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // Reparte las publicaciones en PUBLICACIONES_ROWS filas según su `row`
  // explícito (asignado en el editor) o, si no lo tienen (perfiles viejos),
  // por posición — ver computePublicacionRows en lib/blocks.ts.
  const rows = useMemo<RowData[]>(() => {
    const rowOf = computePublicacionRows(items)
    const titles = data.rowTitles?.length ? data.rowTitles : PUBLICACIONES_DEFAULT_ROW_TITLES
    return Array.from({ length: PUBLICACIONES_ROWS }, (_, rowIndex) => ({
      title: titles[rowIndex] ?? PUBLICACIONES_DEFAULT_ROW_TITLES[rowIndex] ?? "",
      items: items
        .map((item, globalIndex) => ({ item, globalIndex }))
        .filter((_, i) => rowOf[i] === rowIndex),
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
  // Sin efecto de carrusel/auto-scroll: las publicaciones de la fila se
  // reparten el ancho completo en partes iguales (más grandes cuantas menos
  // haya), sin duplicar nada. Al seleccionar una con texto, esa publicación
  // pasa a ocupar el primer lugar (CSS `order`), empujando a las demás, y su
  // texto se despliega en un panel justo a su derecha.
  const [activeId, setActiveId] = useState<string | null>(null)

  const selectOrOpen = (item: PublicacionItem, globalIndex: number) => {
    // Sin texto que mostrar → abrir directo el visor inmersivo.
    if (!item.caption) {
      onOpen(globalIndex)
      return
    }
    setActiveId((current) => (current === item.id ? null : item.id))
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
      </div>

      <div className="flex items-stretch gap-4">
        {row.items.map(({ item, globalIndex }, i) => (
          <PublicacionCell
            key={item.id}
            item={item}
            active={activeId === item.id}
            order={activeId !== null ? (activeId === item.id ? -1 : i) : undefined}
            onSelect={() => selectOrOpen(item, globalIndex)}
            onOpen={() => onOpen(globalIndex)}
            onClose={() => setActiveId(null)}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Celda de publicación — la imagen (3:4) ocupa todo el ancho que le toca en
// la fila (más grande cuantas menos publicaciones haya) y, al seleccionarla,
// un panel lateral a su derecha despliega el texto: nunca encima de la
// imagen. Las demás publicaciones quedan empujadas a un costado.
// ---------------------------------------------------------------------------

function PublicacionCell({
  item,
  active,
  order,
  onSelect,
  onOpen,
  onClose,
}: {
  item: PublicacionItem
  active: boolean
  /** CSS `order` — la publicación activa usa -1 para pasar a ser la primera. */
  order?: number
  onSelect: () => void
  onOpen: () => void
  onClose: () => void
}) {
  const preview = item.type === "video" ? item.thumbnail : item.url

  return (
    // Publicación NO activa: `flex-1` — reparte con las demás el ancho
    // completo de la fila (más grande cuantas menos publicaciones haya).
    // Activa: `flex-none` — dejar de crecer para hacerle lugar al panel de
    // texto de al lado, sin afectar el alto (self-start en la imagen la
    // libera del stretch de la fila; el panel se estira para igualarlo y
    // scrollea internamente si el texto no entra — min-h-0 en el párrafo es
    // la pieza clave para que esto funcione sin medir nada con JS).
    <div
      className={`flex items-stretch gap-3 ${active ? "flex-none" : "min-w-0 flex-1"}`}
      style={order !== undefined ? { order } : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`group relative aspect-[3/4] shrink-0 self-start overflow-hidden rounded-2xl border bg-card/60 text-left transition-shadow ${
          active ? "w-36 sm:w-44" : "w-full"
        } ${
          active
            ? "border-primary shadow-[0_0_0_1px_var(--primary),0_16px_40px_-20px_var(--primary)]"
            : "border-border hover:shadow-[0_0_0_1px_var(--primary),0_16px_40px_-20px_var(--primary)]"
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt={item.caption ?? (item.type === "video" ? "Video" : "Publicación")}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : item.type === "video" ? (
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
      </button>

      <AnimatePresence initial={false}>
        {active && item.caption && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            // Ancho fijo (no "auto" — Framer Motion animando a width:"auto"
            // crecía hasta el ancho natural del texto, una línea larguísima
            // fuera del contenedor). Alto: SIN fijar — se estira (align-self
            // stretch por default) para igualar el alto natural de la imagen
            // (self-start + aspect-ratio de al lado), gracias a min-h-0 en el
            // párrafo de abajo.
            className="flex w-52 flex-none flex-col overflow-hidden rounded-2xl border border-border bg-card/70 sm:w-64"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Descripción</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar descripción"
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Scrollbar visible a propósito: si el texto excede el alto
                disponible, esta barra es la señal de que se puede subir y
                bajar para leer el resto. */}
            <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-4 pb-2 text-sm leading-relaxed text-foreground [scrollbar-width:thin]">
              {item.caption}
            </p>
            <div className="p-4 pt-3">
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
              >
                {item.type === "video" ? <Play className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                {item.type === "video" ? "Reproducir" : "Ver"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

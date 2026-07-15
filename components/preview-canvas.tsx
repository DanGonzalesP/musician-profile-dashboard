"use client"

import { useState } from "react"
import type { Block } from "@/lib/blocks"
import type { CatalogProduct, CatalogService } from "@/lib/catalog"
import { CanvasBlock } from "@/components/canvas-block"
import { MousePointerClick } from "lucide-react"

type Props = {
  blocks: Block[]
  selectedId: string | null
  isDragging: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onDropAt: (index: number) => void
  onReorderStart: (index: number) => void
  onDragEnd: () => void
  products?: CatalogProduct[]
  services?: CatalogService[]
  shareUrl?: string
  albumCovers?: string[]
  creditsCount?: number
}

export function PreviewCanvas({
  blocks,
  selectedId,
  isDragging,
  onSelect,
  onDelete,
  onMove,
  onDropAt,
  onReorderStart,
  onDragEnd,
  products,
  services,
  shareUrl,
  albumCovers,
  creditsCount,
}: Props) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function handleDrop(index: number) {
    onDropAt(index)
    setDropIndex(null)
  }

  const Indicator = ({ index }: { index: number }) => (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDropIndex(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        handleDrop(index)
      }}
      className={`relative transition-all ${isDragging ? "h-6" : "h-3"}`}
    >
      <div
        className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all ${
          dropIndex === index ? "bg-primary opacity-100" : "opacity-0"
        }`}
      >
        <span
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground ${
            dropIndex === index ? "opacity-100" : "opacity-0"
          }`}
        >
          Soltar aquí
        </span>
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Browser-style profile frame */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-primary/70" />
            <span className="size-2.5 rounded-full bg-chart-2/70" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            amplitude.fm/<span className="text-foreground">nova-reyes</span>
          </div>
        </div>

        <div
          className="min-h-[70vh] space-y-0 p-3 sm:p-4"
          onDragOver={(e) => {
            if (blocks.length === 0) {
              e.preventDefault()
              setDropIndex(0)
            }
          }}
          onDrop={(e) => {
            if (blocks.length === 0) {
              e.preventDefault()
              handleDrop(0)
            }
          }}
        >
          {blocks.length === 0 ? (
            <div
              className={`flex min-h-[60vh] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dropIndex === 0 ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent text-primary">
                <MousePointerClick className="size-6" />
              </span>
              <p className="text-sm font-medium text-foreground">Tu perfil está vacío</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Arrastra bloques desde el panel izquierdo y suéltalos aquí, o usa el botón de más para construir tu página de artista.
              </p>
            </div>
          ) : (
            <>
              <Indicator index={0} />
              {blocks.map((block, i) => (
                <div key={block.id}>
                  <CanvasBlock
                    block={block}
                    index={i}
                    total={blocks.length}
                    selected={selectedId === block.id}
                    onSelect={() => onSelect(block.id)}
                    onDelete={() => onDelete(block.id)}
                    onMove={(dir) => onMove(block.id, dir)}
                    onDragStart={() => onReorderStart(i)}
                    onDragEnd={onDragEnd}
                    products={products}
                    services={services}
                    shareUrl={shareUrl}
                    albumCovers={albumCovers}
                    creditsCount={creditsCount}
                  />
                  <Indicator index={i + 1} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
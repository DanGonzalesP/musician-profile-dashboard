"use client"

import { useState } from "react"
import type { Block } from "@/lib/blocks"
import { CanvasBlock } from "@/components/canvas-block"
import { MousePointerClick } from "lucide-react"
import { MusicPlayer } from "@/components/music-player"
import { MerchGrid } from "@/components/merch-grid"

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
}: Props) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function handleDrop(index: number) {
    onDropAt(index)
    setDropIndex(null)
  }

  const mockTracks = [
    {
      id: "1",
      title: "Sample Song 1",
      audio_file_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      duration_seconds: 372
    },
    {
      id: "2",
      title: "Sample Song 2",
      audio_file_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      duration_seconds: 423
    }
  ]

  const mockProducts = [
    {
      id: "m1",
      title: "Black Vinyl Edition",
      price: 89.90,
      currency: "PEN",
      image_url: "https://images.unsplash.com/photo-1539628399283-a63150b6732b?w=400&q=80"
    },
    {
      id: "m2",
      title: "Official Tour Hoodie",
      price: 120.00,
      currency: "PEN",
      image_url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&q=80"
    }
  ]

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
          Drop here
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
              <p className="text-sm font-medium text-foreground">Your profile is empty</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Drag blocks from the left panel and drop them here, or hit the plus button to build your artist page.
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
                  >
                    {block.type === "tracks" && (
                      <div className="mt-2 p-2">
                        <MusicPlayer tracks={mockTracks} />
                      </div>
                    )}

                    {block.type === "merch" && (
                      <div className="mt-2">
                        <MerchGrid products={mockProducts} />
                      </div>
                    )}
                  </CanvasBlock>
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
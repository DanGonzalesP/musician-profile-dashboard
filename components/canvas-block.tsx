"use client"

import type { Block } from "@/lib/blocks"
import { BlockRenderer } from "@/components/blocks/block-renderer"
import { BLOCK_LIBRARY } from "@/lib/blocks"
import { GripVertical, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react"

type Props = {
  block: Block
  index: number
  total: number
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onDragStart: () => void
  onDragEnd: () => void
  children?: React.ReactNode
}

export function CanvasBlock({
  block,
  index,
  total,
  selected,
  onSelect,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  children, // Recibimos el componente hijo aquí
}: Props) {
  const label = BLOCK_LIBRARY.find((b) => b.type === block.type)?.label ?? block.type

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-2xl border p-1.5 transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-transparent hover:border-border"
      }`}
    >
      {/* Top control bar — appears on hover / selection */}
      <div
        className={`absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-1 py-1 shadow-lg transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
          aria-label="Drag to reorder block"
          className="flex size-7 cursor-grab items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="px-1.5 text-[11px] font-medium text-muted-foreground">{label}</span>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ControlButton
          disabled={index === 0}
          onClick={() => onMove(-1)}
          title="Move up"
          label="Move block up"
        >
          <ArrowUp className="size-4" />
        </ControlButton>
        <ControlButton
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          title="Move down"
          label="Move block down"
        >
          <ArrowDown className="size-4" />
        </ControlButton>
        <ControlButton onClick={onSelect} title="Edit" label="Edit block">
          <Pencil className="size-4" />
        </ControlButton>
        <ControlButton
          onClick={onDelete}
          title="Delete"
          label="Delete block"
          className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </ControlButton>
      </div>

      {/* Live preview content (non-interactive selection surface) */}
      <div className="pointer-events-none overflow-hidden rounded-xl">
        <BlockRenderer block={block} />
      </div>

      {/* Renderiza los componentes inyectados (como el MusicPlayer) */}
      {children}
    </div>
  )
}

function ControlButton({
  children,
  onClick,
  disabled,
  title,
  label,
  className = "text-muted-foreground hover:bg-accent hover:text-foreground",
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex size-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  )
}
"use client"

import { useState } from "react"
import { BLOCK_LIBRARY, type BlockType } from "@/lib/blocks"
import { ChevronDown, Plus, GripVertical } from "lucide-react"

const CATEGORIES = ["Layout", "Music", "Perfil", "Commerce"] as const

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  Layout: "Diseño",
  Music: "Música",
  Perfil: "Perfil",
  Commerce: "Comercio",
}

type Props = {
  onAdd: (type: BlockType) => void
  onDragStart: (type: BlockType) => void
  onDragEnd: () => void
  // true para el rol "Editor" de banda — solo puede tocar el bloque "hero"
  // ya existente, no agregar bloques nuevos (ver Punto 4).
  locked?: boolean
}

export function BlockLibrary({ onAdd, onDragStart, onDragEnd, locked = false }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    Layout: true,
    Music: true,
    Commerce: true,
  })

  if (locked) {
    return (
      <div className="rounded-xl border border-dashed border-sidebar-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
        Tu rol de <span className="font-medium text-foreground">Editor</span> no permite agregar ni reordenar
        bloques — solo puedes modificar fotos, redes sociales y biografía en el bloque principal.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {CATEGORIES.map((category) => {
        const blocks = BLOCK_LIBRARY.filter((b) => b.category === category)
        const isOpen = open[category]
        return (
          <div key={category} className="glass-panel rounded-xl border border-sidebar-border/60">
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [category]: !s[category] }))}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {isOpen && (
              <div className="flex flex-col gap-2 p-2 pt-0">
                {blocks.map((block) => {
                  const Icon = block.icon
                  return (
                    <div
                      key={block.type}
                      draggable
                      onDragStart={() => onDragStart(block.type)}
                      onDragEnd={onDragEnd}
                      className="gradient-border gradient-border-static group relative flex cursor-grab items-start gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 opacity-90 transition-opacity duration-200 hover:bg-sidebar-accent hover:opacity-100 active:cursor-grabbing"
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          {block.label}
                          <GripVertical className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          {block.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAdd(block.type)}
                        title={`Agregar ${block.label}`}
                        aria-label={`Agregar ${block.label}`}
                        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-primary hover:text-primary-foreground group-hover:opacity-100"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

"use client"

// Biblioteca de bloques minimalista: solo icono + una palabra por bloque.
// El "para qué sirve" aparece recién al pasar el cursor, en un tooltip de
// vidrio (glassmorphism) anclado al costado del tile; cada tile tiene un
// glow border que sigue al mouse (.glow-border en globals.css, variables
// --mx/--my actualizadas acá).

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BLOCK_LIBRARY, type BlockType } from "@/lib/blocks"
import { Plus } from "lucide-react"

const CATEGORIES = ["Layout", "Music", "Perfil", "Commerce"] as const

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  Layout: "Diseño",
  Music: "Música",
  Perfil: "Perfil",
  Commerce: "Comercio",
}

type TooltipState = {
  type: BlockType
  label: string
  description: string
  top: number
  left: number
} | null

type Props = {
  onAdd: (type: BlockType) => void
  onDragStart: (type: BlockType) => void
  onDragEnd: () => void
  // true para el rol "Editor" de grupo — solo puede tocar el bloque "hero"
  // ya existente, no agregar bloques nuevos (ver Punto 4).
  locked?: boolean
}

export function BlockLibrary({ onAdd, onDragStart, onDragEnd, locked = false }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const hideTimerRef = useRef<number | null>(null)

  if (locked) {
    return (
      <div className="rounded-xl border border-dashed border-sidebar-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
        Tu rol de <span className="font-medium text-foreground">Editor</span> no permite agregar ni reordenar
        bloques — solo puedes modificar fotos, redes sociales y biografía en el bloque principal.
      </div>
    )
  }

  const showTooltip = (
    e: React.MouseEvent<HTMLDivElement>,
    block: { type: BlockType; label: string; description: string }
  ) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      type: block.type,
      label: block.label,
      description: block.description,
      top: rect.top + rect.height / 2,
      left: rect.right + 14,
    })
  }

  const hideTooltip = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setTooltip(null), 80)
  }

  const trackGlow = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`)
  }

  return (
    <div className="flex flex-col gap-5">
      {CATEGORIES.map((category) => {
        const blocks = BLOCK_LIBRARY.filter((b) => b.category === category)
        if (blocks.length === 0) return null
        return (
          <div key={category}>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {blocks.map((block) => {
                const Icon = block.icon
                return (
                  <div
                    key={block.type}
                    draggable
                    onDragStart={() => {
                      setTooltip(null)
                      onDragStart(block.type)
                    }}
                    onDragEnd={onDragEnd}
                    onMouseEnter={(e) => showTooltip(e, block)}
                    onMouseLeave={hideTooltip}
                    onMouseMove={trackGlow}
                    onClick={() => onAdd(block.type)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onAdd(block.type)
                      }
                    }}
                    aria-label={`Agregar bloque ${block.label}`}
                    className="glow-border group relative flex cursor-grab flex-col items-center gap-1.5 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 px-1 py-3 transition-colors hover:bg-sidebar-accent/70 active:cursor-grabbing"
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary transition-transform duration-200 group-hover:scale-110">
                      <Icon className="size-4.5" />
                    </span>
                    <span className="max-w-full truncate text-[10px] font-medium leading-none text-muted-foreground transition-colors group-hover:text-foreground">
                      {block.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Tooltip glassmorphism — fixed para escapar del overflow del aside */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            key={tooltip.type}
            initial={{ opacity: 0, x: -8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ top: tooltip.top, left: tooltip.left }}
            className="glass-tooltip pointer-events-none fixed z-[60] w-60 -translate-y-1/2 rounded-2xl p-4"
            role="tooltip"
          >
            <span
              aria-hidden="true"
              className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[3px] bg-popover/80"
            />
            <p className="text-sm font-bold text-foreground">{tooltip.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tooltip.description}</p>
            <p className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Plus className="size-3" /> Clic o arrastra al lienzo
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

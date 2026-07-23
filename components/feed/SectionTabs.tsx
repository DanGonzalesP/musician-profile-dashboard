"use client"

// Conmutador de secciones del feed principal: Categorías (el feed vertical de
// siempre, filtrable por rol), Servicios y Productos (cuadrículas de
// descubrimiento). En escritorio va centrado bajo el header, flotando sobre
// el contenido. En móvil se vuelve una columna vertical pegada al borde
// izquierdo — antes era una fila horizontal arriba que tapaba la portada/
// disco del feed, que también queda centrado en pantalla.

import { motion } from "framer-motion"
import { Disc3, Briefcase, ShoppingBag, type LucideIcon } from "lucide-react"

export type FeedSection = "roles" | "servicios" | "productos"

const SECTIONS: { id: FeedSection; label: string; icon: LucideIcon }[] = [
  { id: "roles", label: "Categorías", icon: Disc3 },
  { id: "servicios", label: "Servicios", icon: Briefcase },
  { id: "productos", label: "Productos", icon: ShoppingBag },
]

function SectionButton({
  section,
  selected,
  onClick,
  layoutId,
}: {
  section: (typeof SECTIONS)[number]
  selected: boolean
  onClick: () => void
  layoutId: string
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
        selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {selected && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-full bg-primary shadow-[0_0_20px_-4px_var(--primary)]"
          aria-hidden="true"
        />
      )}
      <Icon className="relative z-10 size-3.5 sm:size-4" />
      <span className="relative z-10">{section.label}</span>
    </button>
  )
}

export function SectionTabs({
  active,
  onChange,
}: {
  active: FeedSection
  onChange: (section: FeedSection) => void
}) {
  return (
    <>
      {/* ── Escritorio: píldora horizontal centrada arriba ────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-50 hidden justify-center lg:flex">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/80 p-1 shadow-xl backdrop-blur-xl">
          {SECTIONS.map((s) => (
            <SectionButton
              key={s.id}
              section={s}
              selected={active === s.id}
              onClick={() => onChange(s.id)}
              layoutId="feed-section-active-desktop"
            />
          ))}
        </div>
      </div>

      {/* ── Móvil: columna vertical pegada a la izquierda ─────────────── */}
      <div className="pointer-events-none fixed left-3 top-20 z-50 flex flex-col sm:top-24 lg:hidden">
        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-border bg-card/80 p-1 shadow-xl backdrop-blur-xl">
          {SECTIONS.map((s) => (
            <SectionButton
              key={s.id}
              section={s}
              selected={active === s.id}
              onClick={() => onChange(s.id)}
              layoutId="feed-section-active-mobile"
            />
          ))}
        </div>
      </div>
    </>
  )
}

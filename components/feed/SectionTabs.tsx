"use client"

// Conmutador de secciones del feed principal: Roles (el feed vertical de
// siempre), Servicios y Productos (cuadrículas de descubrimiento). Va centrado
// bajo el header, flotando sobre el contenido. Se adapta a móvil (píldoras más
// compactas).

import { motion } from "framer-motion"
import { Disc3, Briefcase, ShoppingBag, type LucideIcon } from "lucide-react"

export type FeedSection = "roles" | "servicios" | "productos"

const SECTIONS: { id: FeedSection; label: string; icon: LucideIcon }[] = [
  { id: "roles", label: "Roles", icon: Disc3 },
  { id: "servicios", label: "Servicios", icon: Briefcase },
  { id: "productos", label: "Productos", icon: ShoppingBag },
]

export function SectionTabs({
  active,
  onChange,
}: {
  active: FeedSection
  onChange: (section: FeedSection) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-50 flex justify-center px-4 sm:top-20 lg:top-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/80 p-1 shadow-xl backdrop-blur-xl">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const selected = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(s.id)}
              className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="feed-section-active"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-primary shadow-[0_0_20px_-4px_var(--primary)]"
                  aria-hidden="true"
                />
              )}
              <Icon className="relative z-10 size-3.5 sm:size-4" />
              <span className="relative z-10">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

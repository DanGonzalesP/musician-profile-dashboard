"use client"

// Conmutador de secciones del feed principal: Categorías (el feed vertical de
// siempre, filtrable por rol), Servicios y Productos (cuadrículas de
// descubrimiento). En escritorio va centrado bajo el header, flotando sobre
// el contenido, con ícono + etiqueta. En móvil se vuelve una columna vertical
// de solo íconos pegada al borde izquierdo (el filtro de roles/rubros de
// FeedSidebar sigue siendo el carrusel horizontal de siempre, arriba) — así
// no compite por el mismo espacio horizontal en pantallas angostas. En móvil
// se ubica a la altura de las flechitas de FeedScrollNav (centrado
// verticalmente), al costado opuesto de la pantalla.

import { motion } from "framer-motion"
import { LayoutGrid, Briefcase, ShoppingBag, type LucideIcon } from "lucide-react"

export type FeedSection = "roles" | "servicios" | "productos"

const SECTIONS: { id: FeedSection; label: string; icon: LucideIcon }[] = [
  // LayoutGrid (no Disc3): Disc3 ya lo usa el rol "Master" en el panel de
  // Categorías — repetir el mismo ícono ahí confundía cuál era cuál.
  { id: "roles", label: "Categorías", icon: LayoutGrid },
  { id: "servicios", label: "Servicios", icon: Briefcase },
  { id: "productos", label: "Productos", icon: ShoppingBag },
]

function SectionButton({
  section,
  selected,
  onClick,
  layoutId,
  iconOnly = false,
}: {
  section: (typeof SECTIONS)[number]
  selected: boolean
  onClick: () => void
  layoutId: string
  iconOnly?: boolean
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={section.label}
      title={iconOnly ? section.label : undefined}
      onClick={onClick}
      className={`relative flex items-center transition-colors ${
        iconOnly
          ? "size-8 justify-center rounded-lg"
          : "gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold sm:px-4 sm:text-sm"
      } ${selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {selected && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className={`absolute inset-0 bg-primary shadow-[0_0_20px_-4px_var(--primary)] ${
            iconOnly ? "rounded-lg" : "rounded-full"
          }`}
          aria-hidden="true"
        />
      )}
      <Icon className={`relative z-10 ${iconOnly ? "size-3.5" : "size-3.5 sm:size-4"}`} />
      {!iconOnly && <span className="relative z-10">{section.label}</span>}
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
      {/* ── Escritorio: píldora horizontal centrada arriba, con etiqueta ──
          El padding lateral (pl-72 = ancho de FeedSidebar, pr-80/pr-96 = ancho
          del CommentsPanel) hace que la píldora se centre sobre la MISMA
          columna donde vive el disco del feed, no sobre todo el viewport — así
          "Servicios" (el botón central) queda alineado con el disco y no
          desplazado a la derecha. */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-50 hidden justify-center lg:flex lg:pl-72 lg:pr-80 xl:pr-96">
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

      {/* ── Móvil: columna vertical de solo íconos, a la altura de las
          flechitas de subir/bajar (FeedScrollNav) pero del lado izquierdo ── */}
      <div className="pointer-events-none fixed left-2 top-1/2 z-50 flex -translate-y-1/2 flex-col lg:hidden">
        <div className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border border-border bg-card/80 p-0.5 shadow-xl backdrop-blur-xl">
          {SECTIONS.map((s) => (
            <SectionButton
              key={s.id}
              section={s}
              selected={active === s.id}
              onClick={() => onChange(s.id)}
              layoutId="feed-section-active-mobile"
              iconOnly
            />
          ))}
        </div>
      </div>
    </>
  )
}

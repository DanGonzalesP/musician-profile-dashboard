"use client"

// Barra lateral izquierda del feed. Ahora es genérica: recibe una lista de
// ítems (`items`) y el id activo, y los pinta igual para cualquier sección —
// Roles (Para ti + 7 roles + Grupos + Tienda), Servicios (Profesor + rubros) o
// Productos (Tienda + rubros). Cada ítem tiene su ícono en una loseta con glow;
// el activo se resalta con un fondo deslizante compartido (layoutId) y una
// barra de acento a la izquierda. En móvil se colapsa a una fila horizontal
// deslizable (carrusel lento automático) bajo el header.

import { useEffect, useRef, useState, type ComponentType } from "react"
import { motion } from "framer-motion"
import { AudioWaveform } from "lucide-react"

export type FeedNavItem = {
  id: string
  icon: ComponentType<{ className?: string }>
  label: string
  description: string
  // Etiqueta corta para las píldoras de móvil (si se omite, usa `label`).
  shortLabel?: string
  highlight?: boolean
}

export function FeedSidebar({
  items,
  activeId,
  counts,
  onSelect,
  heading = "Explora",
}: {
  items: FeedNavItem[]
  activeId: string
  counts: Partial<Record<string, number>>
  onSelect: (id: string) => void
  heading?: string
}) {
  // ── Carrusel lento en móvil (ver comentario original): avanza solo y se
  // pausa al tocar.
  const mobileRowRef = useRef<HTMLDivElement | null>(null)
  const [autoScrollPaused, setAutoScrollPaused] = useState(false)

  useEffect(() => {
    if (autoScrollPaused) return
    const el = mobileRowRef.current
    if (!el) return

    let raf = 0
    const SPEED_PX_PER_FRAME = 0.4

    const step = () => {
      if (el.scrollWidth > el.clientWidth) {
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
        el.scrollLeft = atEnd ? 0 : el.scrollLeft + SPEED_PX_PER_FRAME
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [autoScrollPaused])

  return (
    <>
      {/* ── Escritorio: panel vertical desplegado ─────────────────────── */}
      <aside
        aria-label="Filtrar el feed"
        className="pointer-events-none absolute inset-y-0 left-0 z-40 hidden w-64 items-center pl-5 lg:flex"
      >
        <nav className="pointer-events-auto w-full">
          <div className="gradient-border-static relative max-h-[85dvh] overflow-y-auto rounded-3xl bg-card/55 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl scrollbar-thin">
            <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              <AudioWaveform className="size-3" /> {heading}
            </p>

            {items.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                description={item.description}
                selected={activeId === item.id}
                count={counts[item.id]}
                onClick={() => onSelect(item.id)}
                highlight={item.highlight}
              />
            ))}
          </div>
        </nav>
      </aside>

      {/* ── Móvil: fila horizontal deslizable (carrusel lento automático) ──
          Va pegada bajo el header y por encima del disco (que arranca en
          pt-36 en TrackScreen); el riel de secciones ya no compite por este
          espacio porque ahora vive a la altura de las flechitas, ver
          SectionTabs. ── */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-40 sm:top-24 lg:hidden">
        <div
          ref={mobileRowRef}
          role="tablist"
          aria-label="Filtrar el feed"
          onPointerDown={() => setAutoScrollPaused(true)}
          onPointerUp={() => window.setTimeout(() => setAutoScrollPaused(false), 2500)}
          onPointerCancel={() => window.setTimeout(() => setAutoScrollPaused(false), 2500)}
          className="pointer-events-auto flex items-center gap-2 overflow-x-auto py-1 pb-2 px-4 scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <MobileChip
              key={item.id}
              icon={item.icon}
              label={item.shortLabel ?? item.label}
              selected={activeId === item.id}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function SidebarItem({
  icon: Icon,
  label,
  description,
  selected,
  count,
  onClick,
  highlight = false,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  description: string
  selected: boolean
  count?: number
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={description}
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors"
    >
      {selected && (
        <motion.span
          layoutId="feed-sidebar-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-2xl bg-primary/12 ring-1 ring-inset ring-primary/40"
          aria-hidden="true"
        >
          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_var(--primary)]" />
        </motion.span>
      )}
      <span
        className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ${
          selected
            ? "border-primary/50 bg-primary text-primary-foreground shadow-[0_0_18px_-4px_var(--primary)]"
            : highlight
              ? "border-primary/30 bg-primary/10 text-primary group-hover:border-primary/50"
              : "border-border/70 bg-background/50 text-muted-foreground group-hover:border-primary/40 group-hover:text-foreground"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold transition-colors ${
            selected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
          }`}
        >
          {label}
        </span>
        <span className="block truncate text-[10px] leading-tight text-muted-foreground">
          {description}
        </span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span
          className={`relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
            selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function MobileChip({
  icon: Icon,
  label,
  title,
  selected,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  title?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={title ?? label}
      title={title ?? label}
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition-colors ${
        selected
          ? "border-transparent text-primary-foreground"
          : "border-border/70 bg-card/50 text-foreground/85 hover:border-primary/50"
      }`}
    >
      {selected && (
        <motion.span
          layoutId="feed-sidebar-active-mobile"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-full bg-primary shadow-[0_0_20px_-4px_var(--primary)]"
          aria-hidden="true"
        />
      )}
      <Icon className="relative z-10 size-3.5" />
      <span className="relative z-10">{label}</span>
    </button>
  )
}

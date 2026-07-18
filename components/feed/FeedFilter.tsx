"use client"

// Filtro de músicos del feed principal — 5 categorías de una sola palabra.
// Composición asimétrica: a la izquierda un bloque editorial (eyebrow +
// descripción de la categoría activa) y a la derecha las píldoras con la
// línea de base desfasada (cada chip impar baja unos px). La píldora activa
// se resalta con un fondo deslizante compartido (layoutId de framer-motion).

import { motion } from "framer-motion"
import { Compass } from "lucide-react"
import { MUSICIAN_CATEGORIES, type MusicianCategory } from "@/lib/musician-categories"

export function FeedFilter({
  active,
  onChange,
}: {
  active: MusicianCategory | null
  onChange: (category: MusicianCategory | null) => void
}) {
  const activeMeta = MUSICIAN_CATEGORIES.find((c) => c.id === active) ?? null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-40 sm:top-16">
      <div className="flex flex-col gap-2 px-4 sm:px-6 lg:flex-row lg:items-start lg:gap-10">
        {/* Bloque editorial izquierdo — ancla visual del filtro */}
        <div className="pointer-events-auto hidden shrink-0 lg:block lg:max-w-52">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Compass className="size-3" /> Explora músicos
          </p>
          <div className="mt-1.5 h-6 overflow-hidden">
            <motion.p
              key={activeMeta?.id ?? "todos"}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="text-xs leading-snug text-muted-foreground"
            >
              {activeMeta ? activeMeta.description : "Toda la comunidad, sin filtrar"}
            </motion.p>
          </div>
          <div
            aria-hidden="true"
            className="mt-2 h-px w-24 bg-gradient-to-r from-primary/70 to-transparent"
          />
        </div>

        {/* Píldoras — línea de base desfasada para el ritmo asimétrico */}
        <div
          role="tablist"
          aria-label="Filtrar músicos por categoría"
          className="pointer-events-auto flex items-start gap-2 overflow-x-auto pb-3 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <FilterChip
            label="Todos"
            selected={active === null}
            onClick={() => onChange(null)}
            offset={false}
            subtle
          />
          {MUSICIAN_CATEGORIES.map((category, i) => (
            <FilterChip
              key={category.id}
              label={category.label}
              title={category.description}
              selected={active === category.id}
              onClick={() => onChange(active === category.id ? null : category.id)}
              offset={i % 2 === 1}
            />
          ))}
        </div>

        {/* Descripción bajo las píldoras en pantallas chicas */}
        <div className="pointer-events-none -mt-1 h-4 overflow-hidden px-1 lg:hidden">
          <motion.p
            key={activeMeta?.id ?? "todos-sm"}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="truncate text-[11px] text-muted-foreground"
          >
            {activeMeta ? activeMeta.description : ""}
          </motion.p>
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  label,
  title,
  selected,
  onClick,
  offset,
  subtle = false,
}: {
  label: string
  title?: string
  selected: boolean
  onClick: () => void
  offset: boolean
  subtle?: boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      title={title}
      onClick={onClick}
      className={`relative shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold backdrop-blur transition-colors duration-200 ${
        offset ? "translate-y-2" : ""
      } ${
        selected
          ? "border-transparent text-primary-foreground"
          : subtle
            ? "border-border/60 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground"
            : "border-border/80 bg-card/50 text-foreground/90 hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {selected && (
        <motion.span
          layoutId="feed-filter-active"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="absolute inset-0 rounded-full bg-primary shadow-[0_0_24px_-4px_var(--primary)]"
          aria-hidden="true"
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  )
}

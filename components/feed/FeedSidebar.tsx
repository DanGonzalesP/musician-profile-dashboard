"use client"

// Barra lateral izquierda del feed — los 7 roles profesionales + la sección
// de grupos musicales, siempre desplegados en escritorio (nada de chips
// arriba). Cada rol tiene su ícono en una loseta con glow; el activo se
// resalta con un fondo deslizante compartido (layoutId) y una barra de
// acento en el borde izquierdo. En móvil se colapsa a una fila horizontal
// deslizable bajo el header, con los mismos ítems.

import type { ComponentType } from "react"
import { motion } from "framer-motion"
import {
  AudioWaveform,
  Feather,
  Gem,
  Guitar,
  Layers,
  Music4,
  Sparkles,
  SlidersHorizontal,
  Users,
  Wand2,
  Disc3,
} from "lucide-react"
import {
  GROUPS_FILTER_ID,
  MUSICIAN_ROLES,
  type FeedFilterId,
  type MusicianRole,
} from "@/lib/musician-roles"

const ROLE_ICONS: Record<MusicianRole, ComponentType<{ className?: string }>> = {
  autores: Feather,
  compositores: Music4,
  arreglistas: Layers,
  directores: Wand2,
  productores: Disc3,
  mezclas: SlidersHorizontal,
  masters: Gem,
  musicos: Guitar,
}

export function FeedSidebar({
  active,
  counts,
  onChange,
}: {
  active: FeedFilterId | null
  counts: Partial<Record<FeedFilterId | "todos", number>>
  onChange: (filter: FeedFilterId | null) => void
}) {
  const toggle = (id: FeedFilterId | null) =>
    onChange(active === id ? null : id)

  return (
    <>
      {/* ── Escritorio: panel vertical desplegado ─────────────────────── */}
      <aside
        aria-label="Filtrar el feed por rol"
        className="pointer-events-none absolute inset-y-0 left-0 z-40 hidden w-64 items-center pl-5 lg:flex"
      >
        <nav className="pointer-events-auto w-full">
          {/* Sin subtítulos "Roles"/"Comunidad": todos los ítems (Para ti +
              roles + Grupos musicales) van en una sola lista continua, más
              compacta, para que entren completos sin tener que arrastrar la
              página. El scrollbar queda visible (fino) por si en una
              pantalla baja igual no entran todos — así el usuario ve que hay
              más ítems para scrollear DENTRO del panel, sin confundirlo con
              el scroll de la página. */}
          <div className="gradient-border-static relative max-h-[85dvh] overflow-y-auto rounded-3xl bg-card/55 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl [scrollbar-width:thin]">
            <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              <AudioWaveform className="size-3" /> Explora
            </p>

            <SidebarItem
              icon={Sparkles}
              label="Para ti"
              description="Todo el feed, sin filtrar"
              selected={active === null}
              count={counts.todos}
              onClick={() => onChange(null)}
            />

            {MUSICIAN_ROLES.map((role) => (
              <SidebarItem
                key={role.id}
                icon={ROLE_ICONS[role.id]}
                label={role.label}
                description={role.description}
                selected={active === role.id}
                count={counts[role.id]}
                onClick={() => toggle(role.id)}
              />
            ))}

            <SidebarItem
              icon={Users}
              label="Grupos musicales"
              description="Páginas de bandas y ensambles"
              selected={active === GROUPS_FILTER_ID}
              count={counts[GROUPS_FILTER_ID]}
              onClick={() => toggle(GROUPS_FILTER_ID)}
              highlight
            />
          </div>
        </nav>
      </aside>

      {/* ── Móvil: fila horizontal deslizable ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-40 sm:top-20 lg:hidden">
        <div
          role="tablist"
          aria-label="Filtrar el feed por rol"
          className="pointer-events-auto flex items-center gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <MobileChip
            icon={Sparkles}
            label="Para ti"
            selected={active === null}
            onClick={() => onChange(null)}
          />
          {MUSICIAN_ROLES.map((role) => (
            <MobileChip
              key={role.id}
              icon={ROLE_ICONS[role.id]}
              label={role.short}
              title={role.label}
              selected={active === role.id}
              onClick={() => toggle(role.id)}
            />
          ))}
          <MobileChip
            icon={Users}
            label="Grupos"
            selected={active === GROUPS_FILTER_ID}
            onClick={() => toggle(GROUPS_FILTER_ID)}
          />
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

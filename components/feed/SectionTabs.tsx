"use client"

import { Compass, Briefcase, ShoppingBag } from "lucide-react"

export type FeedSection = "roles" | "servicios" | "productos"

const SECTIONS = [
  { id: "roles", label: "Descubrir", icon: Compass },
  { id: "servicios", label: "Servicios", icon: Briefcase },
  { id: "productos", label: "Productos", icon: ShoppingBag },
] as const

export function SectionTabs({ active, onChange }: {
  active: FeedSection
  onChange: (section: FeedSection) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-16 z-50 flex justify-center lg:inset-x-0 lg:top-4 lg:pl-72 lg:pr-80 xl:pr-96">
      <nav aria-label="Secciones de Vibe" className="pointer-events-auto flex w-full max-w-md gap-1 rounded-2xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur-xl lg:w-auto">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => onChange(id)}
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4 sm:text-sm ${
              active === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

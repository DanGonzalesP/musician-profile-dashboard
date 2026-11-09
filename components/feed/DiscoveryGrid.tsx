"use client"

// Cuadrícula de descubrimiento: tarjetas de perfil para las secciones
// Servicios / Productos / Tienda del feed. Cada tarjeta enlaza a la página
// /[username]/tienda del artista. No reproduce audio ni es el feed vertical —
// es un directorio para explorar quién vende u ofrece qué.

import Link from "next/link"
import { ArrowUpRight, SearchX, Store, Users } from "lucide-react"
import type { DiscoveryProfile } from "@/lib/feed/discovery"

export function DiscoveryGrid({
  profiles,
  kind,
  emptyLabel,
  onReset,
}: {
  profiles: DiscoveryProfile[]
  kind: "productos" | "servicios"
  emptyLabel: string
  onReset?: () => void
}) {
  if (profiles.length === 0) {
    return (
      <div className="flex min-h-64 w-full items-center justify-center px-6 pb-24">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-card/50 text-muted-foreground">
            <SearchX className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{onReset ? "No hay coincidencias para mostrar" : "No hay perfiles para mostrar"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{emptyLabel}</p>
          {onReset && (
            <button type="button" onClick={onReset}
              className="mt-5 min-h-11 rounded-xl bg-foreground px-5 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Ver {kind === "servicios" ? "todos los servicios" : "todos los productos"}
            </button>
          )}
        </div>
      </div>
    )
  }

  const countWord = kind === "productos" ? ["producto", "productos"] : ["servicio", "servicios"]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 pb-24 pt-2 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
      {profiles.map((p) => {
        const initial = p.displayName.trim().charAt(0).toUpperCase() || "?"
        return (
          <div
            key={p.profileId}
          >
            <Link
              href={`/${p.slug}/tienda`}
              className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card/50 p-5 backdrop-blur transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                    {p.displayName}
                    {p.isGroup && <Users className="size-3.5 shrink-0 text-primary" />}
                  </p>
                  {p.roles.length > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.roles.slice(0, 3).map(roleLabel).join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                  <Store className="size-3" />
                  {p.count} {p.count === 1 ? countWord[0] : countWord[1]}
                </span>
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-foreground">
                Ver {kind === "productos" ? "tienda" : "servicios"}
                <ArrowUpRight className="size-3.5" />
              </span>
            </Link>
          </div>
        )
      })}
    </div>
  )
}

// Etiqueta corta del rol para las tarjetas (evita depender del label completo).
const ROLE_LABELS: Record<string, string> = {
  autores: "Autor",
  compositores: "Compositor",
  arreglistas: "Arreglista",
  directores: "Director",
  productores: "Productor",
  mezclas: "Mezcla",
  masters: "Master",
  musicos: "Músico",
}

function roleLabel(id: string): string {
  return ROLE_LABELS[id] ?? id
}

"use client"

// Cuadrícula de descubrimiento: tarjetas de perfil para las secciones
// Servicios / Productos / Tienda del feed. Cada tarjeta enlaza a la página
// /[username]/tienda del artista. No reproduce audio ni es el feed vertical —
// es un directorio para explorar quién vende u ofrece qué.

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowUpRight, SearchX, Store, Users } from "lucide-react"
import type { DiscoveryProfile } from "@/lib/feed/discovery"

export function DiscoveryGrid({
  profiles,
  kind,
  emptyLabel,
}: {
  profiles: DiscoveryProfile[]
  kind: "productos" | "servicios"
  emptyLabel: string
}) {
  if (profiles.length === 0) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-card/50 text-muted-foreground">
            <SearchX className="size-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      </div>
    )
  }

  const countWord = kind === "productos" ? ["producto", "productos"] : ["servicio", "servicios"]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 pb-24 pt-2 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
      {profiles.map((p, i) => {
        const initial = p.displayName.trim().charAt(0).toUpperCase() || "?"
        return (
          <motion.div
            key={p.profileId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
          >
            <Link
              href={`/${p.slug}/tienda`}
              className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card/50 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_16px_40px_-16px_var(--primary)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
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
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  <Store className="size-3" />
                  {p.count} {p.count === 1 ? countWord[0] : countWord[1]}
                </span>
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Ver {kind === "productos" ? "tienda" : "servicios"}
                <ArrowUpRight className="size-3.5" />
              </span>
            </Link>
          </motion.div>
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

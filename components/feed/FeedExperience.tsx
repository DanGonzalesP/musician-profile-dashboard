"use client"

// Orquesta el feed principal por SECCIONES (Roles / Servicios / Productos):
//  · Roles     → el feed vertical de siempre (canciones + publicaciones),
//                filtrable por los 7 roles, Grupos musicales y Tienda (esta
//                última muestra la cuadrícula de perfiles que venden productos).
//  · Servicios → cuadrícula de perfiles que ofrecen servicios; el primer ítem
//                del panel es "Profesor" (categoría clases) en lugar de "Para ti".
//  · Productos → cuadrícula de perfiles que venden productos, con "Tienda" al
//                final del panel.
// Los ítems del panel lateral se arman acá y se pasan al FeedSidebar genérico.

import { useMemo, useState, type ComponentType } from "react"
import { motion } from "framer-motion"
import {
  SearchX,
  Sparkles,
  Users,
  Store,
  Feather,
  Music4,
  FileMusic,
  Wand2,
  Gem,
  Disc3,
  SlidersHorizontal,
  User,
  GraduationCap,
  Mic2,
  Radio,
  Package,
  Guitar,
  Shirt,
  Palette,
  Download,
  Ticket,
} from "lucide-react"
import type { FeedItem } from "@/lib/feed/publicPosts"
import type { DiscoveryProfile } from "@/lib/feed/discovery"
import {
  GROUPS_FILTER_ID,
  MUSICIAN_ROLES,
  type FeedFilterId,
} from "@/lib/musician-roles"
import { SERVICE_CATEGORIES, PRODUCT_CATEGORIES } from "@/lib/catalog"
import FeedContainer from "./FeedContainer"
import { FeedSidebar, type FeedNavItem } from "./FeedSidebar"
import { SectionTabs, type FeedSection } from "./SectionTabs"
import { DiscoveryGrid } from "./DiscoveryGrid"

// Íconos por rol — Productor lleva el diamante (Gem) y Master el disco (Disc3).
const ROLE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  autores: Feather,
  compositores: Music4,
  arreglistas: FileMusic,
  directores: Wand2,
  productores: Gem,
  mezclas: SlidersHorizontal,
  masters: Disc3,
  musicos: User,
}

const SERVICE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  clases: GraduationCap,
  produccion: Disc3,
  "mezcla-master": SlidersHorizontal,
  composicion: Music4,
  sesion: Mic2,
  shows: Radio,
  alquiler: Package,
  otro: Sparkles,
}

const PRODUCT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ropa: Shirt,
  "musica-fisica": Disc3,
  accesorios: Package,
  instrumentos: Guitar,
  arte: Palette,
  digital: Download,
  entradas: Ticket,
  otro: Package,
}

function itemRoles(item: FeedItem) {
  return item.kind === "track" ? item.track.roles : item.post.roles
}
function itemIsGroup(item: FeedItem) {
  return item.kind === "track" ? item.track.isGroup : item.post.isGroup
}

export default function FeedExperience({
  items,
  isSampleFeed,
  serviceProviders = [],
  productSellers = [],
}: {
  items: FeedItem[]
  isSampleFeed: boolean
  serviceProviders?: DiscoveryProfile[]
  productSellers?: DiscoveryProfile[]
}) {
  const [section, setSection] = useState<FeedSection>("roles")
  // Un id de filtro por sección; "todos" = sin filtrar (all).
  const [activeId, setActiveId] = useState("todos")

  const changeSection = (next: FeedSection) => {
    setSection(next)
    setActiveId("todos")
  }

  // Alternar: volver a tocar el ítem activo lo deselecciona (vuelve a "todos").
  const handleSelect = (id: string) => setActiveId((prev) => (prev === id ? "todos" : id))

  // ── Ítems del panel según la sección ─────────────────────────────────────
  const navItems: FeedNavItem[] = useMemo(() => {
    if (section === "roles") {
      return [
        { id: "todos", icon: Sparkles, label: "Para ti", description: "Todo el feed, sin filtrar" },
        ...MUSICIAN_ROLES.map((r) => ({
          id: r.id,
          icon: ROLE_ICONS[r.id],
          label: r.label,
          description: r.description,
          shortLabel: r.label,
        })),
        { id: "grupos", icon: Users, label: "Grupos musicales", shortLabel: "Grupos", description: "Páginas de bandas y ensambles", highlight: true },
        { id: "tienda", icon: Store, label: "Tienda", description: "Perfiles que venden productos", highlight: true },
      ]
    }
    if (section === "servicios") {
      // "Profesor" (clases) ocupa el lugar de "Para ti"; luego los demás rubros.
      return SERVICE_CATEGORIES.map((c) => ({
        id: c.id,
        icon: SERVICE_ICONS[c.id] ?? Sparkles,
        label: c.id === "clases" ? "Profesor" : c.label,
        shortLabel: c.id === "clases" ? "Profesor" : undefined,
        description: c.id === "clases" ? "Clases y mentoría" : c.label,
        highlight: c.id === "clases",
      }))
    }
    // Productos: rubros + "Tienda" al final.
    return [
      ...PRODUCT_CATEGORIES.map((c) => ({
        id: c.id,
        icon: PRODUCT_ICONS[c.id] ?? Package,
        label: c.label,
        description: c.label,
      })),
      { id: "tienda", icon: Store, label: "Tienda", description: "Todas las tiendas", highlight: true },
    ]
  }, [section])

  // ── Feed vertical filtrado (solo sección Roles) ──────────────────────────
  const feedFilter: FeedFilterId | null =
    activeId === "todos" || activeId === "tienda"
      ? null
      : (activeId as FeedFilterId)

  const filteredItems = useMemo(() => {
    if (feedFilter === null) return items
    if (feedFilter === GROUPS_FILTER_ID) return items.filter(itemIsGroup)
    return items.filter((item) => itemRoles(item).includes(feedFilter as never))
  }, [items, feedFilter])

  // ── Descubrimiento filtrado por categoría ────────────────────────────────
  const filteredServices = useMemo(() => {
    if (activeId === "todos") return serviceProviders
    return serviceProviders.filter((p) => p.categories.includes(activeId))
  }, [serviceProviders, activeId])

  const filteredProducts = useMemo(() => {
    if (activeId === "todos" || activeId === "tienda") return productSellers
    return productSellers.filter((p) => p.categories.includes(activeId))
  }, [productSellers, activeId])

  // ── Conteos para las losetas del panel ───────────────────────────────────
  const counts = useMemo(() => {
    const c: Partial<Record<string, number>> = {}
    if (section === "roles") {
      c.todos = items.length
      for (const role of MUSICIAN_ROLES) {
        c[role.id] = items.filter((item) => itemRoles(item).includes(role.id)).length
      }
      c[GROUPS_FILTER_ID] = items.filter(itemIsGroup).length
      c.tienda = productSellers.length
    } else if (section === "servicios") {
      for (const cat of SERVICE_CATEGORIES) {
        c[cat.id] = serviceProviders.filter((p) => p.categories.includes(cat.id)).length
      }
    } else {
      for (const cat of PRODUCT_CATEGORIES) {
        c[cat.id] = productSellers.filter((p) => p.categories.includes(cat.id)).length
      }
      c.tienda = productSellers.length
    }
    return c
  }, [section, items, serviceProviders, productSellers])

  const showVerticalFeed = section === "roles" && activeId !== "tienda"

  return (
    <>
      <SectionTabs active={section} onChange={changeSection} />
      <FeedSidebar
        items={navItems}
        activeId={activeId}
        counts={counts}
        onSelect={handleSelect}
        heading={section === "roles" ? "Explora" : section === "servicios" ? "Servicios" : "Productos"}
      />

      {showVerticalFeed ? (
        filteredItems.length === 0 ? (
          <EmptyFeed activeId={activeId} onReset={() => setActiveId("todos")} />
        ) : (
          <div className="lg:pl-72">
            <FeedContainer key={activeId} items={filteredItems} isSampleFeed={isSampleFeed} />
          </div>
        )
      ) : (
        <div className="min-h-dvh overflow-y-auto pl-16 pt-24 lg:pl-72 lg:pt-20">
          {section === "servicios" ? (
            <DiscoveryGrid
              profiles={filteredServices}
              kind="servicios"
              emptyLabel="Todavía no hay perfiles que ofrezcan este servicio."
            />
          ) : (
            <DiscoveryGrid
              profiles={filteredProducts}
              kind="productos"
              emptyLabel="Todavía no hay tiendas con productos aquí."
            />
          )}
        </div>
      )}
    </>
  )
}

function EmptyFeed({ activeId, onReset }: { activeId: string; onReset: () => void }) {
  const activeMeta =
    activeId === GROUPS_FILTER_ID
      ? { label: "Grupos musicales" }
      : (MUSICIAN_ROLES.find((r) => r.id === activeId) ?? null)
  return (
    <div className="flex h-dvh w-full items-center justify-center pl-16 pr-6 lg:pl-72 lg:pr-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-sm text-center"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-card/50 text-muted-foreground">
          <SearchX className="size-6" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-foreground">
          Aún no hay {activeMeta?.label.toLowerCase() ?? "contenido"} aquí
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Prueba con otro filtro o vuelve al feed completo.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          Ver todo
        </button>
      </motion.div>
    </div>
  )
}

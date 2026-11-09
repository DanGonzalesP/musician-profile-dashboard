"use client"

// Orquesta el feed principal por SECCIONES (Roles / Servicios / Productos):
//  · Roles     → el feed vertical de siempre (canciones + publicaciones),
//                filtrable por los 7 roles y Grupos musicales.
//  · Servicios → cuadrícula de perfiles que ofrecen servicios; el primer ítem
//                del panel es "Profesor" (categoría clases) en lugar de "Para ti".
//  · Productos → cuadrícula de perfiles que venden productos, con "Tienda" al
//                final del panel — es la única sección donde aparece.
// Los ítems del panel lateral se arman acá y se pasan al FeedSidebar genérico.

import { useMemo, useState, useTransition, type ComponentType } from "react"
import { useRouter } from "next/navigation"
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
import type { FeedItem, MixedFeedCursor } from "@/lib/feed/publicPosts"
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
import { useProfileBlocks } from "@/lib/use-profile-blocks"
import { useDiscoveryPages } from "@/hooks/use-discovery-pages"
import { useFeedPages } from "@/hooks/use-feed-pages"

const EMPTY_PROFILES: DiscoveryProfile[] = []
const NO_MORE_FEED: MixedFeedCursor = { tracks: { cursor: null, more: false }, posts: { cursor: null, more: false } }

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
  items: suppliedItems,
  isSampleFeed,
  serviceProviders: suppliedServices = EMPTY_PROFILES,
  productSellers: suppliedProducts = EMPTY_PROFILES,
  unavailable = {},
  pagination = NO_MORE_FEED,
}: {
  items: FeedItem[]
  isSampleFeed: boolean
  serviceProviders?: DiscoveryProfile[]
  productSellers?: DiscoveryProfile[]
  unavailable?: Partial<Record<FeedSection, boolean>>
  pagination?: MixedFeedCursor
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const servicesPage = useDiscoveryPages(suppliedServices, "servicios")
  const productsPage = useDiscoveryPages(suppliedProducts, "productos")
  const feedPage = useFeedPages(suppliedItems, pagination)
  const { blockedIds, loading: blocksLoading, failed: blocksFailed, ready: blocksReady, reload: reloadBlocks } = useProfileBlocks()
  const items = useMemo(() => feedPage.items.filter(item => !blockedIds.has(item.kind === "track" ? item.track.profileId : item.post.profileId)), [feedPage.items, blockedIds])
  const serviceProviders = useMemo(() => servicesPage.profiles.filter(profile => !blockedIds.has(profile.profileId)), [servicesPage.profiles, blockedIds])
  const productSellers = useMemo(() => productsPage.profiles.filter(profile => !blockedIds.has(profile.profileId)), [productsPage.profiles, blockedIds])
  const [section, setSection] = useState<FeedSection>("roles")
  // Un id de filtro por sección; "todos" = sin filtrar (all).
  const [filters, setFilters] = useState<Record<FeedSection, string>>({ roles: "todos", servicios: "todos", productos: "todos" })
  const activeId = filters[section]
  const setActiveId = (id: string) => setFilters((previous) => ({ ...previous, [section]: id }))

  const changeSection = (next: FeedSection) => {
    setSection(next)
  }

  // Alternar: volver a tocar el ítem activo lo deselecciona (vuelve a "todos").
  const handleSelect = (id: string) => setActiveId(activeId === id ? "todos" : id)

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
      ]
    }
    if (section === "servicios") {
      return [
        { id: "todos", icon: Sparkles, label: "Todos los servicios", shortLabel: "Todos", description: "Explorar todos los rubros" },
        ...SERVICE_CATEGORIES.map((c) => ({
        id: c.id,
        icon: SERVICE_ICONS[c.id] ?? Sparkles,
        label: c.id === "clases" ? "Profesor" : c.label,
        shortLabel: c.id === "clases" ? "Profesor" : undefined,
        description: c.id === "clases" ? "Clases y mentoría" : c.label,
        highlight: c.id === "clases",
      }))]
    }
    // Productos: rubros + "Tienda" al final.
    return [
      { id: "todos", icon: Store, label: "Todos los productos", shortLabel: "Todos", description: "Explorar todas las tiendas" },
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
  const feedFilter: FeedFilterId | null = activeId === "todos" ? null : (activeId as FeedFilterId)

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
    } else if (section === "servicios") {
      c.todos = serviceProviders.length
      for (const cat of SERVICE_CATEGORIES) {
        c[cat.id] = serviceProviders.filter((p) => p.categories.includes(cat.id)).length
      }
    } else {
      c.todos = productSellers.length
      for (const cat of PRODUCT_CATEGORIES) {
        c[cat.id] = productSellers.filter((p) => p.categories.includes(cat.id)).length
      }
      c.tienda = productSellers.length
    }
    return c
  }, [section, items, serviceProviders, productSellers])

  const showVerticalFeed = section === "roles"
  const isFiltered = activeId !== "todos" && activeId !== "tienda"
  const activeLabel = navItems.find((item) => item.id === activeId)?.label
  const resultCount = section === "servicios" ? filteredServices.length : filteredProducts.length
  const discoveryPage = section === "servicios" ? servicesPage : productsPage

  const waitingForBlocks = blocksLoading || blocksFailed
  const feedFooter = !isSampleFeed ? <div className="max-w-sm space-y-4 text-center" aria-busy={feedPage.loading}>
    <h2 className="text-xl font-semibold">{feedPage.more ? "Sigue explorando" : "Llegaste al final del contenido cargado"}</h2>
    <p className="text-sm text-muted-foreground">{feedPage.more
      ? "Carga más canciones y publicaciones. Se mantendrá el filtro que elegiste."
      : "Puedes cambiar de filtro o actualizar para buscar nuevas publicaciones."}</p>
    {feedPage.error && <p role="alert" className="text-sm text-destructive">{feedPage.error}</p>}
    {feedPage.more && <button type="button" disabled={feedPage.loading || refreshing} onClick={() => void feedPage.loadMore()}
      className="min-h-11 rounded-xl border px-5 font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
      {feedPage.loading ? "Cargando…" : feedPage.error ? "Reintentar" : "Cargar más contenido"}
    </button>}
    <button type="button" disabled={feedPage.loading || refreshing} onClick={() => startRefresh(() => router.refresh())}
      className="min-h-11 rounded-xl border px-5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
      {refreshing ? "Actualizando…" : "Actualizar feed"}
    </button>
    {feedPage.loading && <p role="status">Buscando más contenido…</p>}
  </div> : undefined
  const preferencesNotice = waitingForBlocks ? (
    <section className="mx-auto max-w-xl px-6 pt-40" aria-label="Preferencias del feed">
      {blocksLoading ? <p role="status">Cargando tus preferencias del feed…</p> : <div role="alert">
        <p>No pudimos cargar tus bloqueos. Reintenta para mostrar el feed con tus preferencias.</p>
        <button type="button" onClick={reloadBlocks} className="mt-4 min-h-11 rounded-lg border border-border px-4">Reintentar</button>
      </div>}
    </section>
  ) : null

  return (
    <>
      {preferencesNotice}
      {blocksReady && <div hidden={waitingForBlocks}>
      <SectionTabs active={section} onChange={changeSection} />
      <FeedSidebar
        items={navItems}
        activeId={activeId}
        counts={unavailable[section] ? {} : counts}
        onSelect={handleSelect}
        heading={section === "roles" ? "Explora" : section === "servicios" ? "Servicios" : "Productos"}
      />

      {unavailable[section] ? (
        <section aria-labelledby="section-unavailable-title" className="flex min-h-dvh items-center justify-center px-6 pb-32 pt-48 lg:pl-72 lg:pt-24">
          <div className="max-w-md space-y-4 text-center" aria-busy={refreshing}>
            <h1 id="section-unavailable-title" className="text-2xl font-semibold">
              {section === "roles" ? "No pudimos cargar el feed" : section === "servicios" ? "No pudimos cargar los servicios" : "No pudimos cargar los productos"}
            </h1>
            <p className="text-sm text-muted-foreground">Puedes reintentar o explorar otra sección. No se ha confirmado que este espacio esté vacío.</p>
            <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}
              className="min-h-11 rounded-xl border border-border px-5 font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
              {refreshing ? "Cargando…" : "Reintentar"}
            </button>
            {refreshing && <p role="status" className="text-sm text-muted-foreground">Actualizando el contenido…</p>}
          </div>
        </section>
      ) : showVerticalFeed ? (
        filteredItems.length === 0 && !feedFooter ? (
          <EmptyFeed activeId={activeId} onReset={() => setActiveId("todos")} />
        ) : (
          <div className="lg:pl-72">
            <FeedContainer key={activeId} items={filteredItems} isSampleFeed={isSampleFeed} suspended={waitingForBlocks} footer={feedFooter} />
          </div>
        )
      ) : (
        <section aria-labelledby="discovery-title" className="h-dvh overflow-y-auto scroll-pt-48 scroll-pb-52 pb-52 pt-48 lg:scroll-pt-24 lg:pl-72 lg:pt-24">
          <div className="px-4 pb-6 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">La comunidad de Vibe</p>
            <h1 id="discovery-title" className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {section === "servicios" ? "Servicios musicales" : "Productos de artistas"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {section === "servicios"
                ? "Encuentra clases, producción, sesiones y más. Explora el trabajo de cada creador."
                : "Explora música, instrumentos y creaciones de la comunidad en sus tiendas."}
            </p>
            <div className="mt-4 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
              <p role="status" className="text-sm text-muted-foreground">
                {resultCount} {resultCount === 1 ? "perfil cargado" : "perfiles cargados"}
                {isFiltered && <span className="font-semibold text-foreground"> · {activeLabel}</span>}
              </p>
              {isFiltered && (
                <button type="button" onClick={() => setActiveId("todos")}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold underline underline-offset-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
                  Quitar filtro
                </button>
              )}
            </div>
            {discoveryPage.more && <p className="text-xs text-muted-foreground">Los filtros y sus conteos corresponden a los perfiles cargados. Puedes cargar más abajo.</p>}
            <button type="button" disabled={refreshing || discoveryPage.loading} onClick={() => startRefresh(() => router.refresh())}
              className="mt-2 min-h-11 rounded-lg px-3 text-sm underline underline-offset-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
              {refreshing ? "Actualizando listado…" : "Actualizar listado"}
            </button>
          </div>
          {section === "servicios" ? (
            <DiscoveryGrid
              profiles={filteredServices}
              kind="servicios"
              emptyLabel={discoveryPage.more ? "No hay coincidencias entre los perfiles cargados. Carga más perfiles para seguir explorando." : "No hay perfiles visibles que coincidan con este servicio."}
              onReset={isFiltered ? () => setActiveId("todos") : undefined}
            />
          ) : (
            <DiscoveryGrid
              profiles={filteredProducts}
              kind="productos"
              emptyLabel={discoveryPage.more ? "No hay coincidencias entre los perfiles cargados. Carga más perfiles para seguir explorando." : "No hay tiendas visibles que coincidan aquí."}
              onReset={isFiltered ? () => setActiveId("todos") : undefined}
            />
          )}
          <div className="space-y-3 px-6 pb-8 text-center" aria-busy={discoveryPage.loading}>
            {discoveryPage.error && <p role="alert" className="text-sm text-destructive">{discoveryPage.error}</p>}
            {discoveryPage.more && <button type="button" disabled={discoveryPage.loading || refreshing}
              onClick={() => void discoveryPage.loadMore()}
              className="min-h-11 rounded-xl border border-border px-5 font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
              {discoveryPage.loading ? "Cargando perfiles…" : discoveryPage.error ? "Reintentar cargar más" : "Cargar más perfiles"}
            </button>}
            {discoveryPage.loading && <p role="status" className="text-sm text-muted-foreground">Buscando más perfiles…</p>}
          </div>
        </section>
      )}
      </div>}
    </>
  )
}

function EmptyFeed({ activeId, onReset }: { activeId: string; onReset: () => void }) {
  const activeMeta =
    activeId === GROUPS_FILTER_ID
      ? { label: "Grupos musicales" }
      : (MUSICIAN_ROLES.find((r) => r.id === activeId) ?? null)
  return (
    <div className="flex h-dvh w-full items-center justify-center px-6 pb-16 pt-48 lg:pl-72 lg:pt-24">
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

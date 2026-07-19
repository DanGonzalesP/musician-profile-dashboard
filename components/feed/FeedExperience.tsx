"use client"

// Une la barra lateral de roles con el feed vertical mixto (canciones +
// publicaciones): mantiene el filtro activo, filtra los ítems por los roles
// del autor (o por "grupos musicales") y remonta el contenedor al cambiar
// (para que el scroll/audio arranquen desde cero).

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { SearchX } from "lucide-react"
import type { FeedItem } from "@/lib/feed/publicPosts"
import {
  GROUPS_FILTER_ID,
  MUSICIAN_ROLES,
  type FeedFilterId,
} from "@/lib/musician-roles"
import FeedContainer from "./FeedContainer"
import { FeedSidebar } from "./FeedSidebar"

function itemRoles(item: FeedItem) {
  return item.kind === "track" ? item.track.roles : item.post.roles
}

function itemIsGroup(item: FeedItem) {
  return item.kind === "track" ? item.track.isGroup : item.post.isGroup
}

export default function FeedExperience({
  items,
  isSampleFeed,
}: {
  items: FeedItem[]
  isSampleFeed: boolean
}) {
  const [filter, setFilter] = useState<FeedFilterId | null>(null)

  const filteredItems = useMemo(() => {
    if (!filter) return items
    if (filter === GROUPS_FILTER_ID) return items.filter(itemIsGroup)
    return items.filter((item) => itemRoles(item).includes(filter))
  }, [items, filter])

  const counts = useMemo(() => {
    const result: Partial<Record<FeedFilterId | "todos", number>> = { todos: items.length }
    for (const role of MUSICIAN_ROLES) {
      result[role.id] = items.filter((item) => itemRoles(item).includes(role.id)).length
    }
    result[GROUPS_FILTER_ID] = items.filter(itemIsGroup).length
    return result
  }, [items])

  const activeMeta =
    filter === GROUPS_FILTER_ID
      ? { label: "Grupos musicales", description: "páginas de bandas y ensambles" }
      : (MUSICIAN_ROLES.find((r) => r.id === filter) ?? null)

  return (
    <>
      <FeedSidebar active={filter} counts={counts} onChange={setFilter} />
      {filteredItems.length === 0 ? (
        <div className="flex h-dvh w-full items-center justify-center px-6 lg:pl-72">
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
              {activeMeta
                ? `Todavía nadie publicó como ${activeMeta.label.toLowerCase()} (${activeMeta.description.toLowerCase()}). Prueba con otro rol.`
                : "Todavía no hay música ni publicaciones."}
            </p>
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="mt-4 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              Ver todo
            </button>
          </motion.div>
        </div>
      ) : (
        // En escritorio el feed cede el borde izquierdo a la barra de roles.
        <div className="lg:pl-72">
          <FeedContainer
            key={filter ?? "todos"}
            items={filteredItems}
            isSampleFeed={isSampleFeed}
          />
        </div>
      )}
    </>
  )
}

"use client"

// Une el filtro de músicos con el feed vertical: mantiene la categoría
// activa, filtra las pistas por la categoría del autor y remonta el
// contenedor al cambiar (para que el scroll/audio arranquen desde cero).

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { SearchX } from "lucide-react"
import type { FeedTrack } from "@/lib/musicFeed"
import { MUSICIAN_CATEGORIES, type MusicianCategory } from "@/lib/musician-categories"
import FeedContainer from "./FeedContainer"
import { FeedFilter } from "./FeedFilter"

export default function FeedExperience({
  tracks,
  isSampleFeed,
}: {
  tracks: FeedTrack[]
  isSampleFeed: boolean
}) {
  const [category, setCategory] = useState<MusicianCategory | null>(null)

  const filteredTracks = useMemo(
    () => (category ? tracks.filter((t) => t.category === category) : tracks),
    [tracks, category]
  )

  const activeMeta = MUSICIAN_CATEGORIES.find((c) => c.id === category)

  return (
    <>
      <FeedFilter active={category} onChange={setCategory} />
      {filteredTracks.length === 0 ? (
        <div className="flex h-dvh w-full items-center justify-center px-6">
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
              Aún no hay {activeMeta?.label.toLowerCase() ?? "músicos"} aquí
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {activeMeta
                ? `Todavía nadie publicó música como ${activeMeta.label.toLowerCase()} (${activeMeta.description.toLowerCase()}). Prueba con otra categoría.`
                : "Todavía no hay música publicada."}
            </p>
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="mt-4 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              Ver todos
            </button>
          </motion.div>
        </div>
      ) : (
        <FeedContainer
          key={category ?? "todos"}
          tracks={filteredTracks}
          isSampleFeed={isSampleFeed}
        />
      )}
    </>
  )
}

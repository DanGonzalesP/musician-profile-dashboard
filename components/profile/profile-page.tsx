"use client"

import { PlayBar } from "@/components/player/play-bar"
import { PlayerProvider } from "@/components/player/player-provider"
import { HeroBanner } from "./hero-banner"
import { TrackList } from "./track-list"
import { MerchGrid } from "./merch-grid"
import { LessonsSection } from "./lessons-section"
import type { ArtistProfile, Block } from "@/lib/artist-data"

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case "hero":
      return <HeroBanner key={index} block={block} />
    case "tracks":
      return <TrackList key={index} block={block} />
    case "merch":
      return <MerchGrid key={index} block={block} />
    case "lessons":
      return <LessonsSection key={index} block={block} />
    default:
      return null
  }
}

export function ProfilePage({ profile }: { profile?: ArtistProfile | null }) {
  const blocks = profile?.blocks ?? []
  const heroBlock = blocks.find((b) => b.type === "hero") ?? null
  const bodyBlocks = blocks.filter((b) => b.type !== "hero")

  if (!profile || blocks.length === 0) {
    return (
      <PlayerProvider>
        <main className="min-h-screen pb-32">
          <div className="mx-auto mt-20 flex max-w-5xl flex-col items-center justify-center px-4 text-center sm:px-6">
            <p className="text-lg font-semibold text-foreground">No hay contenido disponible todavía.</p>
            <p className="mt-2 text-sm text-muted-foreground">El perfil se llenará cuando haya datos en Supabase.</p>
          </div>
        </main>
      </PlayerProvider>
    )
  }

  return (
    <PlayerProvider>
      <main className="min-h-screen pb-32">
        {heroBlock ? renderBlock(heroBlock, -1) : null}

        <div className="mx-auto mt-14 flex max-w-5xl flex-col gap-16 px-4 sm:px-6">
          {bodyBlocks.map((block, index) => renderBlock(block, index))}
        </div>

        <footer className="mx-auto mt-20 max-w-5xl px-4 sm:px-6">
          <div className="border-t border-border py-8 text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} {profile.handle || "Perfil"}. All rights reserved.</p>
            <p className="mt-1">Powered by your music platform.</p>
          </div>
        </footer>
      </main>

      <PlayBar />
    </PlayerProvider>
  )
}

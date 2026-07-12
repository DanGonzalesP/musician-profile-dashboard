"use client"

import Image from "next/image"
import { AudioLines, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TracksBlock } from "@/lib/artist-data"
import { formatTime, usePlayer } from "@/components/player/player-provider"

function formatPlays(plays: number) {
  if (plays >= 1000) return `${(plays / 1000).toFixed(1)}K`
  return `${plays}`
}

export function TrackList({ block }: { block: TracksBlock }) {
  const { current, isPlaying, playTrack } = usePlayer()

  return (
    <section aria-labelledby="tracks-heading" className="scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            id="tracks-heading"
            className="font-display text-2xl font-semibold text-foreground sm:text-3xl"
          >
            {block.title}
          </h2>
          {block.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {block.subtitle}
            </p>
          ) : null}
        </div>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-border bg-card">
        {block.tracks.map((track, index) => {
          const isCurrent = current?.id === track.id
          const isActivePlaying = isCurrent && isPlaying
          return (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => playTrack(track, block.tracks)}
                aria-label={`${isActivePlaying ? "Pause" : "Play"} ${track.title}`}
                className={cn(
                  "group flex w-full items-center gap-4 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50 sm:px-4",
                  isCurrent && "bg-muted/40",
                )}
              >
                <span className="hidden w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground sm:block">
                  {index + 1}
                </span>

                <span className="relative size-12 shrink-0 overflow-hidden rounded-md sm:size-14">
                  <Image
                    src={track.artwork || "/placeholder.svg"}
                    alt=""
                    fill
                    className="object-cover"
                  />
                  <span
                    className={cn(
                      "absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100",
                      isCurrent && "opacity-100",
                    )}
                  >
                    {isActivePlaying ? (
                      <Pause className="size-5 text-primary" />
                    ) : (
                      <Play className="size-5 translate-x-px text-primary" />
                    )}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "flex items-center gap-2 truncate text-sm font-medium",
                      isCurrent ? "text-primary" : "text-foreground",
                    )}
                  >
                    {track.title}
                    {isActivePlaying ? (
                      <AudioLines className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatPlays(track.plays)} plays
                  </span>
                </span>

                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatTime(track.duration)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

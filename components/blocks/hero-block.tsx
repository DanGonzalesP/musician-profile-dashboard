"use client"

import { MapPin } from "lucide-react"
import type { HeroData } from "@/lib/blocks"

export function HeroBlock({ data }: { data: HeroData }) {
  const imagePreview = data.image || "/placeholder.svg"

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/20 p-6 text-center sm:p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-24 overflow-hidden rounded-full border-2 border-primary shadow-md sm:size-28">
          <img
            src={imagePreview}
            alt={data.name || "Artist Name"}
            className="size-full object-cover"
          />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {data.name || "Nombre del Artista"}
          </h2>
          {data.location && (
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-primary" />
              {data.location}
            </p>
          )}
        </div>
        {data.tagline && (
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {data.tagline}
          </p>
        )}
      </div>
    </div>
  )
}
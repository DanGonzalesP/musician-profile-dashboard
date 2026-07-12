"use client"

import type { Block } from "@/lib/blocks"
import { HeroBlock } from "./hero-block"
import { TrackListBlock } from "./track-list-block" // Asegúrate de usar el nombre de archivo exacto
import { MerchBlock } from "./merch-block"
import { ServiceBlock } from "./service-block"

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "hero":
      return <HeroBlock data={block.data as any} />
    case "tracks":
      return <TrackListBlock data={block.data as any} />
    case "merch":
      return <MerchBlock data={block.data as any} />
    case "service":
      return <ServiceBlock data={block.data as any} />
    default:
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Tipo de bloque desconocido: {block.type}
        </div>
      )
  }
}
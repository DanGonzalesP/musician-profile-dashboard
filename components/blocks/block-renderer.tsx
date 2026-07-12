"use client"

import type { Block, HeroData, TracksData, MerchData, ServiceData } from "@/lib/blocks"
import { HeroBlock } from "./hero-block"
import { TrackListBlock } from "./track-list-block" // Asegúrate de usar el nombre de archivo exacto
import { MerchBlock } from "./merch-block"
import { ServiceBlock } from "./service-block"

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "hero":
      return <HeroBlock data={block.data as HeroData} />
    case "tracks":
      return <TrackListBlock data={block.data as TracksData} />
    case "merch":
      return <MerchBlock data={block.data as MerchData} />
    case "service":
      return <ServiceBlock data={block.data as ServiceData} />
    default:
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Tipo de bloque desconocido: {block.type}
        </div>
      )
  }
}
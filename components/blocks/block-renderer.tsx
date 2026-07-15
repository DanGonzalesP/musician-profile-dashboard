"use client"

import type { Block, HeroData, SingleData, TracksData, MerchData, ServiceData, DonationData } from "@/lib/blocks"
import type { CatalogProduct, CatalogService } from "@/lib/catalog"
import { HeroBlock } from "./hero-block"
import { FeaturedSingleBlock } from "./featured-single-block"
import { TrackListBlock } from "./track-list-block"
import { MerchBlock } from "./merch-block"
import { ServiceBlock } from "./service-block"
import { DonationBlock } from "./donation-block"

export function BlockRenderer({
  block,
  products = [],
  services = [],
  shareUrl,
  albumCovers = [],
}: {
  block: Block
  products?: CatalogProduct[]
  services?: CatalogService[]
  shareUrl?: string
  albumCovers?: string[]
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlock data={block.data as HeroData} shareUrl={shareUrl} albumCovers={albumCovers} />
    case "single":
      return <FeaturedSingleBlock data={block.data as SingleData} />
    case "tracks":
      return <TrackListBlock data={block.data as TracksData} />
    case "merch":
      return <MerchBlock data={block.data as MerchData} products={products} />
    case "service":
      return <ServiceBlock data={block.data as ServiceData} services={services} />
    case "donation":
      return <DonationBlock data={block.data as DonationData} />
    default:
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Tipo de bloque desconocido: {block.type}
        </div>
      )
  }
}

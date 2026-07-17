"use client"

import type { Block, HeroData, SingleData, CrowdfundingData, TracksData, CatalogData, CreditsData, MerchData, ServiceData, DonationData, LegadoData, PublicacionesData, EmbedsData } from "@/lib/blocks"
import type { CatalogProduct, CatalogService } from "@/lib/catalog"
import { HeroBlock } from "./hero-block"
import { FeaturedSingleBlock } from "./featured-single-block"
import { CrowdfundingBlock } from "./crowdfunding-block"
import { TrackListBlock } from "./track-list-block"
import { CatalogCarouselBlock } from "./catalog-carousel-block"
import { CreditsBlock } from "./credits-block"
import { MerchBlock } from "./merch-block"
import { ServiceBlock } from "./service-block"
import { DonationBlock } from "./donation-block"
import { LegadoBlock } from "./legado-block"
import { PublicacionesBlock } from "./publicaciones-block"
import { EmbedsBlock } from "./embeds-block"

export function BlockRenderer({
  block,
  products = [],
  services = [],
  shareUrl,
  albumCovers = [],
  creditsCount = 0,
}: {
  block: Block
  products?: CatalogProduct[]
  services?: CatalogService[]
  shareUrl?: string
  albumCovers?: string[]
  creditsCount?: number
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlock data={block.data as HeroData} shareUrl={shareUrl} albumCovers={albumCovers} creditsCount={creditsCount} />
    case "single":
      return <FeaturedSingleBlock data={block.data as SingleData} />
    case "crowdfunding":
      return <CrowdfundingBlock data={block.data as CrowdfundingData} />
    case "tracks":
      return <TrackListBlock data={block.data as TracksData} />
    case "catalog":
      return <CatalogCarouselBlock data={block.data as CatalogData} />
    case "credits":
      return <CreditsBlock data={block.data as CreditsData} />
    case "merch":
      return <MerchBlock data={block.data as MerchData} products={products} />
    case "service":
      return <ServiceBlock data={block.data as ServiceData} services={services} />
    case "donation":
      return <DonationBlock data={block.data as DonationData} />
    case "legado":
      return <LegadoBlock data={block.data as LegadoData} />
    case "publicaciones":
      return <PublicacionesBlock data={block.data as PublicacionesData} />
    case "embeds":
      return <EmbedsBlock data={block.data as EmbedsData} />
    default:
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Tipo de bloque desconocido: {block.type}
        </div>
      )
  }
}

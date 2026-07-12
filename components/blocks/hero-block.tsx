import { MapPin, BadgeCheck } from "lucide-react"
import type { HeroData } from "@/lib/blocks"

export function HeroBlock({ data }: { data: HeroData }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <img
        src={data.image || "/placeholder.svg"}
        alt={`${data.name} banner`}
        className="h-56 w-full object-cover sm:h-72"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-7">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <BadgeCheck className="size-4" />
          <span>Verified Artist</span>
        </div>
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {data.name}
        </h2>
        <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{data.tagline}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          <span>{data.location}</span>
        </div>
      </div>
    </div>
  )
}

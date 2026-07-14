"use client"

import { Sparkles } from "lucide-react"
import type { ServiceData } from "@/lib/blocks"
import type { CatalogService } from "@/lib/catalog"
import { useLocale } from "@/components/locale-provider"

export function ServiceBlock({ data, services }: { data: ServiceData; services: CatalogService[] }) {
  const { t } = useLocale()
  const servicios = services || []

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h3 className="font-display mb-5 flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        <Sparkles className="size-5 text-primary" />
        {data.title || t("service_title")}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {servicios.map((service, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-2xl border border-border bg-background/40 p-5 transition-colors hover:border-primary/40"
          >
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-foreground">{service.title || t("service_new")}</p>
              {service.description && (
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {service.description}
                </p>
              )}
            </div>
            <p className="mt-4 text-xl font-bold tabular-nums text-primary">
              {service.price || t("service_price_inquire")}
            </p>
          </div>
        ))}
      </div>
      {servicios.length === 0 && (
        <p className="text-xs italic text-muted-foreground text-center py-2">{t("service_empty")}</p>
      )}
    </div>
  )
}
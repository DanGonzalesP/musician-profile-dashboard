"use client"

import { Sparkles } from "lucide-react"
import type { ServiceData } from "@/lib/blocks"

export function ServiceBlock({ data }: { data: ServiceData }) {
  const servicios = data.services || []

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="size-4 text-primary" />
        {data.title || "Servicios y Ofertas"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {servicios.map((service, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-primary/40"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{service.title || "Nuevo Servicio"}</p>
              {service.description && (
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                  {service.description}
                </p>
              )}
            </div>
            <p className="mt-3 text-sm font-bold text-primary">
              {service.price ? `$${service.price}` : "Consultar precio"}
            </p>
          </div>
        ))}
      </div>
      {servicios.length === 0 && (
        <p className="text-xs italic text-muted-foreground text-center py-2">No hay ofertas disponibles por ahora.</p>
      )}
    </div>
  )
}
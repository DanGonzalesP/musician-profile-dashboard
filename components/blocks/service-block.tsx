"use client"

import { useEffect, useState } from "react"
import { GraduationCap, ArrowUpRight } from "lucide-react"
import type { ServiceData } from "@/lib/blocks"
import { supabase } from "@/lib/supabase"

interface DbService {
  id: number
  title: string
  description: string
  price: number | string
}

export function ServiceBlock({ data }: { data: ServiceData }) {
  const [servicios, setServicios] = useState<DbService[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function obtenerServicios() {
      // 1. Obtener ID del artista
      const { data: artist } = await supabase
        .from("artist")
        .select("id")
        .eq("username", "novareyes")
        .single()

      if (artist) {
        // 2. Traer servicios de la tabla
        const { data: servicesData } = await supabase
          .from("services")
          .select("id, title, description, price")
          .eq("artist_id", artist.id)

        if (servicesData) {
          setServicios(servicesData as DbService[])
        }
      }
      setLoading(false)
    }

    obtenerServicios()
  }, [])

  if (loading) {
    return <div className="p-4 text-xs text-center text-muted-foreground">Cargando servicios...</div>
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <GraduationCap className="size-4 text-primary" />
        {data.title || "Servicios"}
      </h3>
      <div className="flex flex-col gap-3">
        {servicios.map((service) => (
          <div
            key={service.id}
            className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-primary/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{service.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{service.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold text-primary">
                {typeof service.price === "number" ? `$${service.price.toFixed(2)}` : service.price}
              </span>
              <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                <ArrowUpRight className="size-4" />
              </span>
            </div>
          </div>
        ))}
      </div>
      {servicios.length === 0 && (
        <p className="text-xs italic text-muted-foreground text-center py-2">No hay servicios disponibles.</p>
      )}
    </div>
  )
}
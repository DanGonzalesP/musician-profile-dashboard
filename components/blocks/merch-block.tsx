"use client"

import { useEffect, useState } from "react"
import { ShoppingBag } from "lucide-react"
import type { MerchData } from "@/lib/blocks"
import { supabase } from "@/lib/supabase"

interface DbProduct {
  id: number
  name: string
  price: number | string
  image_url?: string
  tag?: string
}

export function MerchBlock({ data }: { data: MerchData }) {
  const [productos, setProductos] = useState<DbProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function obtenerMerch() {
      // 1. Obtener ID del artista Nova Reyes
      const { data: artist } = await supabase
        .from("artist")
        .select("id")
        .eq("username", "novareyes")
        .single()

      if (artist) {
        // 2. Traer productos de la tabla merch vinculados al artista
        const { data: merchData } = await supabase
          .from("merch")
          .select("id, name, price, image_url, tag")
          .eq("artist_id", artist.id)

        if (merchData) {
          setProductos(merchData as DbProduct[])
        }
      }
      setLoading(false)
    }

    obtenerMerch()
  }, [])

  if (loading) {
    return <div className="p-4 text-xs text-center text-muted-foreground">Cargando tienda...</div>
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShoppingBag className="size-4 text-primary" />
        {data.title || "Official Merch"}
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {productos.map((product) => (
          <div
            key={product.id}
            className="group overflow-hidden rounded-lg border border-border bg-background/40 transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={product.image_url || "/placeholder.svg"}
                alt={product.name}
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {product.tag && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {product.tag}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 p-3">
              <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{product.name}</p>
              <p className="text-sm font-semibold text-primary">
                {typeof product.price === "number" ? `$${product.price.toFixed(2)}` : product.price}
              </p>
            </div>
          </div>
        ))}
      </div>
      {productos.length === 0 && (
        <p className="text-xs italic text-muted-foreground text-center py-2">No hay productos disponibles por ahora.</p>
      )}
    </div>
  )
}
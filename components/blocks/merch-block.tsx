"use client"

import { ShoppingBag } from "lucide-react"
import type { MerchData } from "@/lib/blocks"

export function MerchBlock({ data }: { data: MerchData }) {
  // Extraemos los productos directamente de la propiedad dinámica del editor
  const productos = data.products || []

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShoppingBag className="size-4 text-primary" />
        {data.title || "Official Merch"}
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {productos.map((product, i) => (
          <div
            key={i}
            className="group overflow-hidden rounded-lg border border-border bg-background/40 transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={product.image || "/placeholder.svg"}
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
              <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{product.name || "Nuevo Producto"}</p>
              <p className="text-sm font-semibold text-primary">
                {product.price ? `$${product.price}` : "$0.00"}
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
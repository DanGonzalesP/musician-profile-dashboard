"use client"

import { ShoppingBag } from "lucide-react"
import type { MerchData } from "@/lib/blocks"
import type { CatalogProduct } from "@/lib/catalog"

function stockLabel(stock: number) {
  if (stock <= 0) return "Agotado"
  if (stock <= 5) return "¡Últimas unidades!"
  return `${stock} disponibles`
}

export function MerchBlock({ data, products }: { data: MerchData; products: CatalogProduct[] }) {
  const productos = products || []

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <h3 className="mb-5 flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        <ShoppingBag className="size-5 text-primary" />
        {data.title || "Merch Oficial"}
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {productos.map((product, i) => (
          <div
            key={i}
            className="group overflow-hidden rounded-2xl border border-border bg-background/40 transition-colors hover:border-primary/40"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={product.imageUrl || "/placeholder.svg"}
                alt={product.name}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
                {stockLabel(product.stock)}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-4">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{product.name || "Nuevo Producto"}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {product.price || "$0.00"}
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

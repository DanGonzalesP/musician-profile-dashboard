"use client"

import { ShoppingBag } from "lucide-react"

interface Product {
  id: string
  title: string
  price: number
  currency: string
  image_url: string
}

interface MerchGridProps {
  products: Product[]
}

export function MerchGrid({ products }: MerchGridProps) {
  if (!products || products.length === 0) {
    return <p className="text-xs text-muted-foreground">No hay productos en la tienda.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-2">
      {products.map((product) => (
        <div key={product.id} className="group overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          {/* Imagen del Producto */}
          <div className="relative aspect-square w-full bg-muted overflow-hidden">
            <img
              src={product.image_url}
              alt={product.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
          
          {/* Detalles */}
          <div className="p-3">
            <h4 className="truncate text-xs font-medium text-foreground">{product.title}</h4>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">
                {product.currency} {product.price.toFixed(2)}
              </span>
              <button 
                type="button"
                className="rounded-full bg-secondary p-1.5 text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <ShoppingBag className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
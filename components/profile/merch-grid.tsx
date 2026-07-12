"use client"

import Image from "next/image"
import { useState } from "react"
import { Check, Plus, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { MerchBlock, Product } from "@/lib/artist-data"

// Deterministic thousands separator so server and client render identically
function formatPrice(value: number) {
  return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function ProductCard({
  product,
  onAdd,
}: {
  product: Product
  onAdd: () => void
}) {
  const [added, setAdded] = useState(false)

  const handleAdd = () => {
    if (product.soldOut) return
    setAdded(true)
    onAdd()
    window.setTimeout(() => setAdded(false), 1600)
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={product.image || "/placeholder.svg"}
          alt={product.name}
          fill
          className={cn(
            "object-cover transition-transform duration-500 group-hover:scale-105",
            product.soldOut && "opacity-60",
          )}
        />
        {product.badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {product.badge}
          </span>
        ) : null}
        {product.soldOut ? (
          <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {product.category}
        </p>
        <h3 className="mt-1 text-pretty font-medium leading-snug text-foreground">
          {product.name}
        </h3>

        <div className="mt-4 flex items-center justify-between gap-3 pt-1">
          <span className="text-lg font-semibold tabular-nums text-foreground">
            ${formatPrice(product.price)}
          </span>
          <Button
            onClick={handleAdd}
            disabled={product.soldOut}
            variant={added ? "secondary" : "default"}
            size="sm"
          >
            {product.soldOut ? (
              "Unavailable"
            ) : added ? (
              <>
                <Check />
                Added
              </>
            ) : (
              <>
                {product.price > 500 ? <ShoppingCart /> : <Plus />}
                {product.price > 500 ? "Buy now" : "Add to cart"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MerchGrid({ block }: { block: MerchBlock }) {
  const [cartCount, setCartCount] = useState(0)

  return (
    <section aria-labelledby="merch-heading" className="scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            id="merch-heading"
            className="font-display text-2xl font-semibold text-foreground sm:text-3xl"
          >
            {block.title}
          </h2>
          {block.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {block.subtitle}
            </p>
          ) : null}
        </div>
        {cartCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground">
            <ShoppingCart className="size-4 text-primary" />
            {cartCount} in cart
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {block.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAdd={() => setCartCount((c) => c + 1)}
          />
        ))}
      </div>
    </section>
  )
}

import type { CatalogProduct } from "@/lib/catalog"

/** Native disclosure keeps the full catalog readable with keyboard and without JS. */
export function CatalogProductDetails({ product }: { product: CatalogProduct }) {
  const variants = (product.variants || []).filter(group => group.options.length > 0)
  if (!product.description && variants.length === 0) return null

  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="min-h-11 cursor-pointer content-center rounded-md py-2 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        Detalles del producto<span className="sr-only">: {product.name}</span>
      </summary>
      <div className="space-y-3 pb-3">
        {product.description && <p className="whitespace-pre-wrap break-words leading-relaxed">{product.description}</p>}
        {variants.length > 0 && (
          <dl className="space-y-2">
            {variants.map((group, index) => (
              <div key={`${group.name}-${index}`} className="break-words">
                <dt className="font-medium text-foreground">{group.name}</dt>
                <dd>{group.options.join(" · ")}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  )
}

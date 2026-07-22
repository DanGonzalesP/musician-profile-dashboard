"use client"

// Tienda pública del artista — vitrina completa: producto destacado en
// grande, filtros por categoría, tarjetas con badges (digital/stock),
// variantes visibles y botón de compra. Los productos vienen de la tabla
// `products` (gestión en /perfil/admin-merch o en el editor).

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Download, Package, ShoppingBag, Sparkles } from "lucide-react"
import type { MerchData } from "@/lib/blocks"
import { productCategoryLabel, type CatalogProduct } from "@/lib/catalog"
import { useLocale } from "@/components/locale-provider"

function formatPrice(product: CatalogProduct): string {
  const value = Number(product.price)
  if (product.price === "" || Number.isNaN(value)) return "—"
  return `${product.currency || "USD"} ${value.toFixed(2)}`
}

function StockBadge({ product }: { product: CatalogProduct }) {
  if (product.kind === "digital") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/85 px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
        <Download className="size-2.5" /> Digital
      </span>
    )
  }
  if (product.stock <= 0) {
    return (
      <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
        Agotado
      </span>
    )
  }
  if (product.stock <= 5) {
    return (
      <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-semibold text-black">
        ¡Últimas {product.stock}!
      </span>
    )
  }
  return null
}

function BuyButton({ product, big = false }: { product: CatalogProduct; big?: boolean }) {
  const soldOut = product.kind === "fisico" && product.stock <= 0
  const base = big
    ? "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all"
    : "flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all"

  if (soldOut) {
    return (
      <span className={`${base} cursor-not-allowed bg-secondary text-muted-foreground`}>Agotado</span>
    )
  }
  if (product.purchaseUrl) {
    return (
      <a
        href={product.purchaseUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`${base} bg-primary text-primary-foreground shadow-[0_0_24px_-8px_var(--primary)] hover:opacity-90 hover:shadow-[0_0_32px_-6px_var(--primary)]`}
      >
        <ShoppingBag className={big ? "size-4" : "size-3.5"} />
        {product.kind === "digital" ? "Descargar / Comprar" : "Comprar"}
        <ArrowUpRight className={big ? "size-4" : "size-3.5"} />
      </a>
    )
  }
  return (
    <span className={`${base} border border-primary/40 bg-primary/10 text-primary`}>
      Consulta al artista
    </span>
  )
}

function VariantChips({ product, max = 6 }: { product: CatalogProduct; max?: number }) {
  const group = product.variants?.[0]
  if (!group || group.options.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{group.name}:</span>
      {group.options.slice(0, max).map((opt) => (
        <span key={opt} className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80">
          {opt}
        </span>
      ))}
      {group.options.length > max && (
        <span className="text-[10px] text-muted-foreground">+{group.options.length - max}</span>
      )}
    </div>
  )
}

export function MerchBlock({ data, products }: { data: MerchData; products: CatalogProduct[] }) {
  const { t } = useLocale()
  const [category, setCategory] = useState<string>("todo")

  const activos = useMemo(() => (products || []).filter((p) => p.isActive !== false), [products])

  const categories = useMemo(() => {
    const ids = [...new Set(activos.map((p) => p.category || "otro"))]
    return ids.length > 1 ? ids : []
  }, [activos])

  const filtered = category === "todo" ? activos : activos.filter((p) => (p.category || "otro") === category)

  const featured = category === "todo" ? filtered.find((p) => p.isFeatured) : undefined
  const rest = featured ? filtered.filter((p) => p.id !== featured.id) : filtered

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <ShoppingBag className="size-5 text-primary" />
          {data.title || t("merch_title")}
        </h3>
        {activos.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {activos.length} {activos.length === 1 ? "producto" : "productos"}
          </span>
        )}
      </div>

      {/* Filtros por categoría */}
      {categories.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCategory("todo")}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              category === "todo"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            Todo
          </button>
          {categories.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                category === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {productCategoryLabel(id).split(" (")[0]}
            </button>
          ))}
        </div>
      )}

      {/* Producto destacado */}
      {featured && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="gradient-border relative mb-6 overflow-hidden rounded-2xl bg-card/60"
        >
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-square overflow-hidden md:aspect-auto md:min-h-72">
              {featured.images?.[0] ? (
                <img
                  src={featured.images[0]}
                  alt={featured.name}
                  className="size-full object-cover transition-transform duration-700 hover:scale-105"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-linear-to-br from-primary/20 via-card to-background">
                  <Package className="size-14 text-primary/50" />
                </div>
              )}
              <div className="absolute left-3 top-3 flex gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-[0_0_16px_-4px_var(--primary)]">
                  <Sparkles className="size-2.5" /> Destacado
                </span>
                <StockBadge product={featured} />
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {productCategoryLabel(featured.category).split(" (")[0]}
              </span>
              <h4 className="font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
                {featured.name}
              </h4>
              {featured.description && (
                <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{featured.description}</p>
              )}
              <VariantChips product={featured} />
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <p className="text-2xl font-bold tabular-nums text-foreground">{formatPrice(featured)}</p>
                <BuyButton product={featured} big />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Grilla de productos — auto-fill según el ancho real del contenedor
          (no del viewport): en el lienzo angosto del editor esto evita que
          sm:/lg: fuercen 3-4 columnas sobre un espacio que sigue siendo
          angosto, lo que aplastaba cada tarjeta. */}
      <motion.div
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {rest.map((product) => {
          const soldOut = product.kind === "fisico" && product.stock <= 0
          return (
            <motion.div
              key={product.id}
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } } }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background/40 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_16px_40px_-16px_var(--primary)]"
            >
              <div className="relative aspect-square overflow-hidden">
                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className={`size-full object-cover transition-transform duration-500 group-hover:scale-105 ${soldOut ? "grayscale" : ""}`}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-linear-to-br from-card via-background to-black">
                    <Package className="size-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="absolute left-2 top-2">
                  <StockBadge product={product} />
                </div>
                {product.images?.[1] && (
                  <img
                    src={product.images[1]}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/80">
                  {productCategoryLabel(product.category).split(" (")[0]}
                </span>
                <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                  {product.name || t("merch_new_product")}
                </p>
                <VariantChips product={product} max={4} />
                <div className="mt-auto flex flex-col gap-1.5 pt-2">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(product)}</p>
                  <BuyButton product={product} />
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {activos.length === 0 && (
        <p className="py-2 text-center text-xs italic text-muted-foreground">{t("merch_empty")}</p>
      )}
    </div>
  )
}

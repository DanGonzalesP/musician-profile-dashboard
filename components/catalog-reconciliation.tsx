"use client"

import type { CatalogProduct, CatalogService } from "@/lib/catalog"

export type CatalogChoice = { products: CatalogProduct[]; services: CatalogService[] }

function CatalogSummary({ catalog }: { catalog: CatalogChoice }) {
  return <div className="space-y-3">
    <p>{catalog.products.length} productos · {catalog.services.length} servicios</p>
    {catalog.products.map((p) => <details key={p.id} className="rounded-lg border p-3">
      <summary className="min-h-11 cursor-pointer break-words font-medium focus-visible:outline focus-visible:outline-2">{p.name || "Producto sin nombre"} · {p.currency} {p.price}</summary>
      <div className="space-y-2 break-words text-sm">
        <p className="whitespace-pre-wrap">{p.description || "Sin descripción"}</p>
        <p>Stock: {p.stock} · {p.isActive ? "Visible" : "Oculto"} · {p.isFeatured ? "Destacado" : "No destacado"}</p>
        <p>Categoría: {p.category} · Tipo: {p.kind}</p>
        {p.variants.map((v, i) => <p key={i}>{v.name}: {v.options.join(", ")}</p>)}
        <p>Enlace de compra: {p.purchaseUrl || "Sin enlace"}</p>
        <p>Imágenes: {p.images.length}</p>
      </div>
    </details>)}
    {catalog.services.map((s) => <details key={s.id} className="rounded-lg border p-3">
      <summary className="min-h-11 cursor-pointer break-words font-medium focus-visible:outline focus-visible:outline-2">{s.title || "Servicio sin nombre"} · {s.currency} {s.price}</summary>
      <div className="space-y-2 break-words text-sm">
        <p className="whitespace-pre-wrap">{s.description || "Sin descripción"}</p>
        <p>{s.isActive ? "Visible" : "Oculto"} · {s.isFeatured ? "Destacado" : "No destacado"}</p>
        <p>Categoría: {s.category} · Modalidad: {s.modality} · Precio por: {s.priceUnit}</p>
        <p>Duración: {s.duration} {s.durationUnit} · Entrega: {s.deliveryTime || "Sin plazo"}</p>
        {s.features.map((feature, i) => <p key={i}>{feature}</p>)}
        <p>Reserva: {s.bookingUrl || "Sin enlace"} · {s.imageUrl ? "Con imagen" : "Sin imagen"}</p>
      </div>
    </details>)}
  </div>
}

export function CatalogReconciliation({ draft, published, busy, error, onChoose, onDownloadDraft }: {
  draft: CatalogChoice
  published: CatalogChoice
  busy: boolean
  error: string
  onChoose: (source: "draft" | "published") => void
  onDownloadDraft?: () => void
}) {
  function downloadCopy() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ borrador: draft, tienda_publicada: published }, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "vibe-comparacion-catalogos.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="mx-auto max-w-5xl space-y-5 p-4 text-foreground sm:p-8" aria-busy={busy}>
    <h1 className="text-2xl font-bold">Revisa el catálogo de tu borrador</h1>
    <p>La tienda puede haber cambiado desde que guardaste este borrador. Compara ambas opciones y elige cuál seguir editando. Tus bloques del perfil se conservan.</p>
    <p>Esta elección guarda el borrador; la tienda pública solo cambiará cuando publiques. Puedes guardar una copia de ambas opciones antes de elegir.</p>
    <button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4 disabled:opacity-50" onClick={downloadCopy}>Guardar copia de ambas opciones</button>
    {onDownloadDraft && <button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4 disabled:opacity-50" onClick={onDownloadDraft}>Descargar textos y estructura del borrador</button>}
    {error && <div className="space-y-2 rounded-lg border border-destructive p-3">
      <p role="alert">{error}</p>
      <button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4" onClick={() => window.location.reload()}>Volver a cargar el editor</button>
    </div>}
    {busy && <p role="status">Guardando tu elección…</p>}
    <div className="grid gap-5 md:grid-cols-2">
      {(["published", "draft"] as const).map((source) => <section key={source} aria-labelledby={`catalog-${source}`} className="space-y-4 rounded-xl border p-4">
        <h2 id={`catalog-${source}`} className="text-lg font-semibold">{source === "published" ? "Tienda publicada" : "Catálogo del borrador"}</h2>
        <p className="text-sm">{source === "published" ? "Sustituye solo los productos y servicios del borrador por los que están publicados." : "Conserva los productos y servicios del borrador. Al publicar, reemplazarán la tienda actual."}</p>
        <button type="button" disabled={busy || Boolean(error)} onClick={() => onChoose(source)} className="min-h-11 rounded-lg border px-4 font-medium disabled:opacity-50">{source === "published" ? "Usar tienda publicada" : "Conservar catálogo del borrador"}</button>
        <CatalogSummary catalog={source === "published" ? published : draft} />
      </section>)}
    </div>
  </main>
}

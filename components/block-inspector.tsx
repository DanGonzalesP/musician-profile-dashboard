"use client"

import { useState } from "react"
import type { Block, HeroData, TracksData, MerchData, ServiceData, DonationData } from "@/lib/blocks"
import { BLOCK_LIBRARY } from "@/lib/blocks"
import { type CatalogProduct, type CatalogService, newProduct, newService } from "@/lib/catalog"
import { X, Trash2, Upload, Loader2, Plus, Music, Heart } from "lucide-react"

type BlobRegistry = React.MutableRefObject<Map<string, File>>

type Props = {
  block: Block | null
  onChange: (id: string, data: Block["data"]) => void
  onClose: () => void
  onDelete: (id: string) => void
  blobRegistry: BlobRegistry
  products: CatalogProduct[]
  onProductsChange: (products: CatalogProduct[]) => void
  services: CatalogService[]
  onServicesChange: (services: CatalogService[]) => void
}

export function BlockInspector({
  block,
  onChange,
  onClose,
  onDelete,
  blobRegistry,
  products,
  onProductsChange,
  services,
  onServicesChange,
}: Props) {
  if (!block) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-foreground">Nothing selected</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Select a block on the canvas to edit its content here.
        </p>
      </div>
    )
  }

  const def = BLOCK_LIBRARY.find((b) => b.type === block.type)
  const update = (data: Block["data"]) => onChange(block.id, data)

  return (
    <div className="flex h-full flex-col bg-sidebar text-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Editing</p>
          <p className="text-sm font-semibold text-foreground">{def?.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {block.type === "hero" && (
          <HeroFields data={block.data as HeroData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "tracks" && (
          <TracksFields data={block.data as TracksData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "merch" && (
          <MerchFields
            data={block.data as MerchData}
            onChange={update}
            blobRegistry={blobRegistry}
            products={products}
            onProductsChange={onProductsChange}
          />
        )}
        {block.type === "service" && (
          <ServiceFields
            data={block.data as ServiceData}
            onChange={update}
            services={services}
            onServicesChange={onServicesChange}
          />
        )}
        {block.type === "donation" && (
          <DonationFields data={block.data as DonationData} onChange={update} />
        )}
      </div>

      <div className="border-t border-sidebar-border p-4 bg-sidebar">
        <button
          type="button"
          onClick={() => onDelete(block.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
        >
          <Trash2 className="size-4" />
          Delete block
        </button>
      </div>
    </div>
  )
}

// ─── Shared UI primitives ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={inputClass} />
}

// ─── ImageUploader — usa blob URL para preview inmediato ──────────────────

function ImageUploader({
  onUploadReady,
  currentImageUrl,
  blobRegistry,
}: {
  onUploadReady: (blobUrl: string) => void
  currentImageUrl?: string
  blobRegistry: BlobRegistry
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    // Revocar blob URL anterior si existe para liberar memoria
    if (localPreview && localPreview.startsWith("blob:")) {
      URL.revokeObjectURL(localPreview)
    }

    // Crear blob URL temporal — la preview reacciona al instante
    const blobUrl = URL.createObjectURL(file)

    // Registrar el archivo real para subirlo al publicar
    blobRegistry.current.set(blobUrl, file)

    setLocalPreview(blobUrl)
    onUploadReady(blobUrl)

    // Reset del input para permitir re-seleccionar el mismo archivo
    e.target.value = ""
  }

  const displayUrl = localPreview || currentImageUrl

  return (
    <div className="space-y-2">
      {displayUrl && (
        <div className="relative h-20 w-full overflow-hidden rounded-lg border border-sidebar-border bg-muted">
          <img src={displayUrl} alt="Preview" className="h-full w-full object-cover" />
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
        <Upload className="size-3.5 text-muted-foreground" />
        <span>Subir imagen</span>
        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </label>
    </div>
  )
}

// ─── AudioUploader — blob URL inmediata para pistas ───────────────────────

function AudioUploader({
  onUploadReady,
  currentAudioUrl,
  blobRegistry,
}: {
  onUploadReady: (blobUrl: string) => void
  currentAudioUrl?: string
  blobRegistry: BlobRegistry
}) {
  const [fileName, setFileName] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    const blobUrl = URL.createObjectURL(file)
    blobRegistry.current.set(blobUrl, file)

    setFileName(file.name)
    onUploadReady(blobUrl)
    e.target.value = ""
  }

  const hasAudio = Boolean(fileName || currentAudioUrl)
  const displayName = fileName || (currentAudioUrl ? "Audio cargado ✓" : null)

  return (
    <div className="space-y-1.5">
      {displayName && (
        <p className="flex items-center gap-1.5 truncate rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          <Music className="size-3 shrink-0" />
          <span className="truncate">{displayName}</span>
        </p>
      )}
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors ${
          hasAudio
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-input bg-background text-foreground hover:bg-accent"
        }`}
      >
        <Music className="size-3.5 text-muted-foreground" />
        <span>{hasAudio ? "Cambiar audio" : "Subir audio (MP3/WAV)"}</span>
        <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
      </label>
    </div>
  )
}

// ─── HeroFields ───────────────────────────────────────────────────────────

function HeroFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: HeroData
  onChange: (d: HeroData) => void
  blobRegistry: BlobRegistry
}) {
  return (
    <>
      <Field label="Artist name">
        <TextInput value={data.name || ""} onChange={(e) => onChange({ ...data, name: e.target.value })} />
      </Field>
      <Field label="Banner Image">
        <ImageUploader
          currentImageUrl={data.image}
          onUploadReady={(url) => onChange({ ...data, image: url })}
          blobRegistry={blobRegistry}
        />
      </Field>
      <Field label="Tagline">
        <textarea
          value={data.tagline || ""}
          onChange={(e) => onChange({ ...data, tagline: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </Field>
      <Field label="Location">
        <TextInput value={data.location || ""} onChange={(e) => onChange({ ...data, location: e.target.value })} />
      </Field>
    </>
  )
}

// ─── TracksFields ─────────────────────────────────────────────────────────

function TracksFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: TracksData
  onChange: (d: TracksData) => void
  blobRegistry: BlobRegistry
}) {
  const setTrack = (i: number, key: "title" | "duration" | "audioUrl", value: string) => {
    const tracks = (data.tracks || []).map((t, idx) => (idx === i ? { ...t, [key]: value } : t))
    onChange({ ...data, tracks })
  }

  const addTrack = () => {
    const tracks = [...(data.tracks || []), { title: "New Track", duration: "3:30" }]
    onChange({ ...data, tracks })
  }

  const removeTrack = (i: number) => {
    const tracks = (data.tracks || []).filter((_, idx) => idx !== i)
    onChange({ ...data, tracks })
  }

  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title || ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field label="Album cover">
        <ImageUploader
          currentImageUrl={data.cover}
          onUploadReady={(url) => onChange({ ...data, cover: url })}
          blobRegistry={blobRegistry}
        />
      </Field>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tracks</p>
        <button
          type="button"
          onClick={addTrack}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Add Track
        </button>
      </div>
      <div className="space-y-3">
        {(data.tracks || []).map((track, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground min-w-4">{i + 1}</span>
              <input
                type="text"
                value={track.title || ""}
                onChange={(e) => setTrack(i, "title", e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="Track title"
              />
              <input
                type="text"
                value={track.duration || ""}
                onChange={(e) => setTrack(i, "duration", e.target.value)}
                className={`${inputClass} w-16 text-center`}
                placeholder="3:45"
              />
              <button
                type="button"
                onClick={() => removeTrack(i)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Eliminar pista"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <AudioUploader
              currentAudioUrl={track.audioUrl}
              onUploadReady={(url) => setTrack(i, "audioUrl", url)}
              blobRegistry={blobRegistry}
            />
          </div>
        ))}
      </div>
    </>
  )
}

// ─── MerchFields ──────────────────────────────────────────────────────────

function MerchFields({
  data,
  onChange,
  blobRegistry,
  products,
  onProductsChange,
}: {
  data: MerchData
  onChange: (d: MerchData) => void
  blobRegistry: BlobRegistry
  products: CatalogProduct[]
  onProductsChange: (products: CatalogProduct[]) => void
}) {
  const setProduct = (i: number, changes: Partial<CatalogProduct>) => {
    onProductsChange(products.map((p, idx) => (idx === i ? { ...p, ...changes } : p)))
  }

  const addProduct = () => {
    onProductsChange([...products, newProduct()])
  }

  const removeProduct = (i: number) => {
    onProductsChange(products.filter((_, idx) => idx !== i))
  }

  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title || ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Products</p>
        <button
          type="button"
          onClick={addProduct}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Add Product
        </button>
      </div>
      <div className="space-y-4">
        {products.map((product, i) => (
          <div key={product.id} className="space-y-2 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Product #{i + 1}</span>
              <button
                type="button"
                onClick={() => removeProduct(i)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <Field label="Name">
              <TextInput
                value={product.name || ""}
                onChange={(e) => setProduct(i, { name: e.target.value })}
                placeholder="Product name"
              />
            </Field>
            <Field label="Image">
              <ImageUploader
                currentImageUrl={product.imageUrl}
                onUploadReady={(url) => setProduct(i, { imageUrl: url })}
                blobRegistry={blobRegistry}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Price">
                <TextInput
                  value={product.price || ""}
                  onChange={(e) => setProduct(i, { price: e.target.value })}
                  placeholder="89.90"
                />
              </Field>
              <Field label="Stock">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={product.stock}
                  onChange={(e) => setProduct(i, { stock: Math.max(0, Number(e.target.value) || 0) })}
                  className={inputClass}
                  aria-label={`Stock de ${product.name || `producto ${i + 1}`}`}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── ServiceFields ────────────────────────────────────────────────────────

function ServiceFields({
  data,
  onChange,
  services,
  onServicesChange,
}: {
  data: ServiceData
  onChange: (d: ServiceData) => void
  services: CatalogService[]
  onServicesChange: (services: CatalogService[]) => void
}) {
  const setService = (i: number, key: "title" | "price" | "description", value: string) => {
    onServicesChange(services.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)))
  }

  const addService = () => {
    onServicesChange([...services, newService()])
  }

  const removeService = (i: number) => {
    onServicesChange(services.filter((_, idx) => idx !== i))
  }

  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title || ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offers</p>
        <button
          type="button"
          onClick={addService}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Add Offer
        </button>
      </div>
      <div className="space-y-3">
        {services.map((service, i) => (
          <div key={service.id} className="space-y-2 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Offer #{i + 1}</span>
              <button
                type="button"
                onClick={() => removeService(i)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <TextInput
              value={service.title || ""}
              onChange={(e) => setService(i, "title", e.target.value)}
              placeholder="Service title"
            />
            <TextInput
              value={service.price || ""}
              onChange={(e) => setService(i, "price", e.target.value)}
              placeholder="Price"
            />
            <textarea
              value={service.description || ""}
              onChange={(e) => setService(i, "description", e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Description"
            />
          </div>
        ))}
      </div>
    </>
  )
}

// ─── DonationFields ───────────────────────────────────────────────────────

function DonationFields({
  data,
  onChange,
}: {
  data: DonationData
  onChange: (d: DonationData) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">
        <Heart className="size-3.5 shrink-0" />
        <span>Panel de Donaciones — configura tu campaña de apoyo</span>
      </div>
      <Field label="Título del panel">
        <TextInput
          value={data.title || ""}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Support My Music"
        />
      </Field>
      <Field label="Descripción">
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Cuéntale a tus fans por qué apoyarte..."
        />
      </Field>
      <div className="flex gap-2">
        <Field label="Moneda">
          <select
            value={data.currency || "USD"}
            onChange={(e) => onChange({ ...data, currency: e.target.value })}
            className={inputClass}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="PEN">PEN</option>
            <option value="MXN">MXN</option>
            <option value="COP">COP</option>
            <option value="ARS">ARS</option>
          </select>
        </Field>
        <Field label="Meta de recaudación">
          <TextInput
            value={data.goalAmount || ""}
            onChange={(e) => onChange({ ...data, goalAmount: e.target.value })}
            placeholder="500 (opcional)"
          />
        </Field>
      </div>
      <Field label="Texto del botón">
        <TextInput
          value={data.buttonText || ""}
          onChange={(e) => onChange({ ...data, buttonText: e.target.value })}
          placeholder="Support Now"
        />
      </Field>
      <Field label="URL del botón (Ko-fi, PayPal, etc.)">
        <TextInput
          value={data.buttonUrl || ""}
          onChange={(e) => onChange({ ...data, buttonUrl: e.target.value })}
          placeholder="https://ko-fi.com/tu-usuario"
        />
      </Field>
    </>
  )
}

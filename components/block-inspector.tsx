"use client"

import type { Block, HeroData, TracksData, MerchData, ServiceData } from "@/lib/blocks"
import { BLOCK_LIBRARY } from "@/lib/blocks"
import { X, Trash2 } from "lucide-react"

type Props = {
  block: Block | null
  onChange: (id: string, data: Block["data"]) => void
  onClose: () => void
  onDelete: (id: string) => void
}

export function BlockInspector({ block, onChange, onClose, onDelete }: Props) {
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
    <div className="flex h-full flex-col">
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

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {block.type === "hero" && <HeroFields data={block.data as HeroData} onChange={update} />}
        {block.type === "tracks" && <TracksFields data={block.data as TracksData} onChange={update} />}
        {block.type === "merch" && <MerchFields data={block.data as MerchData} onChange={update} />}
        {block.type === "service" && <ServiceFields data={block.data as ServiceData} onChange={update} />}
      </div>

      <div className="border-t border-sidebar-border p-4">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={inputClass} />
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-sidebar-border pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

function HeroFields({ data, onChange }: { data: HeroData; onChange: (d: HeroData) => void }) {
  return (
    <>
      <Field label="Artist name">
        <TextInput value={data.name} onChange={(e) => onChange({ ...data, name: e.target.value })} />
      </Field>
      <Field label="Tagline">
        <textarea
          value={data.tagline}
          onChange={(e) => onChange({ ...data, tagline: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </Field>
      <Field label="Location">
        <TextInput value={data.location} onChange={(e) => onChange({ ...data, location: e.target.value })} />
      </Field>
    </>
  )
}

function TracksFields({ data, onChange }: { data: TracksData; onChange: (d: TracksData) => void }) {
  const setTrack = (i: number, key: "title" | "duration", value: string) => {
    const tracks = data.tracks.map((t, idx) => (idx === i ? { ...t, [key]: value } : t))
    onChange({ ...data, tracks })
  }
  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <GroupLabel>Tracks</GroupLabel>
      {data.tracks.map((track, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={track.title}
            onChange={(e) => setTrack(i, "title", e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <input
            type="text"
            value={track.duration}
            onChange={(e) => setTrack(i, "duration", e.target.value)}
            className={`${inputClass} w-16 text-center`}
          />
        </div>
      ))}
    </>
  )
}

function MerchFields({ data, onChange }: { data: MerchData; onChange: (d: MerchData) => void }) {
  const setProduct = (i: number, key: "name" | "price" | "tag", value: string) => {
    const products = data.products.map((p, idx) => (idx === i ? { ...p, [key]: value } : p))
    onChange({ ...data, products })
  }
  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <GroupLabel>Products</GroupLabel>
      {data.products.map((product, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-sidebar-border p-3">
          <TextInput value={product.name} onChange={(e) => setProduct(i, "name", e.target.value)} />
          <div className="flex gap-2">
            <TextInput value={product.price} onChange={(e) => setProduct(i, "price", e.target.value)} />
            <TextInput value={product.tag} onChange={(e) => setProduct(i, "tag", e.target.value)} />
          </div>
        </div>
      ))}
    </>
  )
}

function ServiceFields({ data, onChange }: { data: ServiceData; onChange: (d: ServiceData) => void }) {
  const setService = (i: number, key: "title" | "price" | "description", value: string) => {
    const services = data.services.map((s, idx) => (idx === i ? { ...s, [key]: value } : s))
    onChange({ ...data, services })
  }
  return (
    <>
      <Field label="Section title">
        <TextInput value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <GroupLabel>Offers</GroupLabel>
      {data.services.map((service, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-sidebar-border p-3">
          <TextInput value={service.title} onChange={(e) => setService(i, "title", e.target.value)} />
          <TextInput value={service.price} onChange={(e) => setService(i, "price", e.target.value)} />
          <textarea
            value={service.description}
            onChange={(e) => setService(i, "description", e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>
      ))}
    </>
  )
}

"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import type { LegadoData, LegadoMember, LegadoMilestone } from "@/lib/blocks"
import { Field, TextInput, inputClass, ImageUploader, type BlobRegistry } from "@/components/block-inspector"

// ─── Editor de listas de texto simples (géneros / influencias) ────────────

function TagListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState("")

  function addTag() {
    const value = draft.trim()
    if (!value) return
    onChange([...values, value])
    setDraft("")
  }

  return (
    <Field label={label}>
      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={addTag}
          className="flex shrink-0 items-center justify-center rounded-lg border border-input bg-background px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Agregar ${label.toLowerCase()}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value, i) => (
            <span
              key={`${value}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Quitar ${value}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </Field>
  )
}

// ─── Hitos de trayectoria ───────────────────────────────────────────────

function TimelineFields({
  timeline,
  onChange,
  blobRegistry,
}: {
  timeline: LegadoMilestone[]
  onChange: (timeline: LegadoMilestone[]) => void
  blobRegistry: BlobRegistry
}) {
  const addMilestone = () => {
    onChange([
      ...timeline,
      { id: `milestone-${Date.now()}`, year: "", title: "", description: "", image: "" },
    ])
  }

  const setMilestone = (index: number, changes: Partial<LegadoMilestone>) => {
    onChange(timeline.map((m, i) => (i === index ? { ...m, ...changes } : m)))
  }

  const removeMilestone = (index: number) => {
    onChange(timeline.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Trayectoria — hitos de carrera
        </p>
        <button
          type="button"
          onClick={addMilestone}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar hito
        </button>
      </div>

      {timeline.map((milestone, index) => (
        <div key={milestone.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={milestone.year}
              onChange={(e) => setMilestone(index, { year: e.target.value })}
              placeholder="Año, ej. 2021"
            />
            <button
              type="button"
              onClick={() => removeMilestone(index)}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Eliminar hito"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <TextInput
            value={milestone.title}
            onChange={(e) => setMilestone(index, { title: e.target.value })}
            placeholder="Título, ej. Primer álbum"
          />
          <textarea
            value={milestone.description}
            onChange={(e) => setMilestone(index, { description: e.target.value })}
            rows={2}
            className={inputClass}
            placeholder="Descripción breve"
          />
          <ImageUploader
            currentImageUrl={milestone.image}
            onUploadReady={(url) => setMilestone(index, { image: url })}
            blobRegistry={blobRegistry}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Integrantes de banda ───────────────────────────────────────────────

function MembersFields({
  members,
  onChange,
  blobRegistry,
}: {
  members: LegadoMember[]
  onChange: (members: LegadoMember[]) => void
  blobRegistry: BlobRegistry
}) {
  const addMember = () => {
    onChange([...members, { id: `member-${Date.now()}`, name: "", role: "", photo: "", bio: "" }])
  }

  const setMember = (index: number, changes: Partial<LegadoMember>) => {
    onChange(members.map((m, i) => (i === index ? { ...m, ...changes } : m)))
  }

  const removeMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Integrantes — dejar vacío si sos solista
        </p>
        <button
          type="button"
          onClick={addMember}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar integrante
        </button>
      </div>

      {members.map((member, index) => (
        <div key={member.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={member.name}
              onChange={(e) => setMember(index, { name: e.target.value })}
              placeholder="Nombre"
            />
            <button
              type="button"
              onClick={() => removeMember(index)}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Eliminar integrante"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <TextInput
            value={member.role}
            onChange={(e) => setMember(index, { role: e.target.value })}
            placeholder="Rol, ej. Baterista"
          />
          <ImageUploader
            currentImageUrl={member.photo}
            onUploadReady={(url) => setMember(index, { photo: url })}
            blobRegistry={blobRegistry}
          />
          <textarea
            value={member.bio || ""}
            onChange={(e) => setMember(index, { bio: e.target.value })}
            rows={2}
            className={inputClass}
            placeholder="Bio corta (aparece al voltear la tarjeta)"
          />
        </div>
      ))}
    </div>
  )
}

// ─── Galería de referencia ──────────────────────────────────────────────

function GalleryFields({
  gallery,
  onChange,
  blobRegistry,
}: {
  gallery: string[]
  onChange: (gallery: string[]) => void
  blobRegistry: BlobRegistry
}) {
  const addImage = () => onChange([...gallery, ""])
  const setImage = (index: number, url: string) => onChange(gallery.map((g, i) => (i === index ? url : g)))
  const removeImage = (index: number) => onChange(gallery.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Galería de referencia (fotos de prensa/shows)
        </p>
        <button
          type="button"
          onClick={addImage}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar foto
        </button>
      </div>

      {gallery.map((url, index) => (
        <div key={index} className="flex items-start gap-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex-1">
            <ImageUploader
              currentImageUrl={url}
              onUploadReady={(newUrl) => setImage(index, newUrl)}
              blobRegistry={blobRegistry}
            />
          </div>
          <button
            type="button"
            onClick={() => removeImage(index)}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Eliminar foto"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────

export function LegadoFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: LegadoData
  onChange: (d: LegadoData) => void
  blobRegistry: BlobRegistry
}) {
  return (
    <>
      <Field label="Frase destacada">
        <textarea
          value={data.headline}
          onChange={(e) => onChange({ ...data, headline: e.target.value })}
          rows={2}
          className={inputClass}
          placeholder="Una frase corta que resuma tu carrera o tu sonido"
        />
      </Field>
      <Field label="Biografía">
        <textarea
          value={data.bio}
          onChange={(e) => onChange({ ...data, bio: e.target.value })}
          rows={6}
          className={inputClass}
          placeholder="Tu historia como artista"
        />
      </Field>
      <TagListEditor
        label="Géneros"
        values={data.genres}
        onChange={(genres) => onChange({ ...data, genres })}
        placeholder="Ej. Cumbia, Trap"
      />
      <TagListEditor
        label="Influencias"
        values={data.influences}
        onChange={(influences) => onChange({ ...data, influences })}
        placeholder="Ej. Los Ángeles Azules"
      />
      <TimelineFields
        timeline={data.timeline}
        onChange={(timeline) => onChange({ ...data, timeline })}
        blobRegistry={blobRegistry}
      />
      <MembersFields
        members={data.members}
        onChange={(members) => onChange({ ...data, members })}
        blobRegistry={blobRegistry}
      />
      <GalleryFields
        gallery={data.gallery}
        onChange={(gallery) => onChange({ ...data, gallery })}
        blobRegistry={blobRegistry}
      />
    </>
  )
}

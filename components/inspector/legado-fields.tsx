"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import type {
  LegadoAward,
  LegadoData,
  LegadoEducation,
  LegadoGalleryItem,
  LegadoMilestone,
  LegadoPress,
  LegadoShow,
  LegadoStat,
} from "@/lib/blocks"
import { Field, TextInput, inputClass, ImageUploader, type BlobRegistry } from "@/components/block-inspector"

// ─── Editor de listas de texto simples (géneros / influencias / skills) ───

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

// ─── Encabezado de sección con botón "Agregar" ────────────────────────────

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        <Plus className="size-3" /> Agregar
      </button>
    </div>
  )
}

function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      title={title}
    >
      <Trash2 className="size-3.5" />
    </button>
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

  return (
    <div className="space-y-2">
      <SectionHeader title="Hitos de carrera" onAdd={addMilestone} />

      {timeline.map((milestone, index) => (
        <div key={milestone.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={milestone.year}
              onChange={(e) => setMilestone(index, { year: e.target.value })}
              placeholder="Año, ej. 2021"
            />
            <RemoveButton onClick={() => onChange(timeline.filter((_, i) => i !== index))} title="Eliminar hito" />
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

// ─── Cifras destacadas ──────────────────────────────────────────────────

function StatsFields({ stats, onChange }: { stats: LegadoStat[]; onChange: (s: LegadoStat[]) => void }) {
  const add = () => onChange([...stats, { id: `stat-${Date.now()}`, value: "", label: "" }])
  const set = (i: number, changes: Partial<LegadoStat>) =>
    onChange(stats.map((s, idx) => (idx === i ? { ...s, ...changes } : s)))

  return (
    <div className="space-y-2">
      <SectionHeader title="Cifras destacadas (máx. 4 visibles)" onAdd={add} />
      {stats.map((stat, i) => (
        <div key={stat.id} className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <TextInput
            value={stat.value}
            onChange={(e) => set(i, { value: e.target.value })}
            placeholder="+300"
          />
          <TextInput
            value={stat.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="Shows en vivo"
          />
          <RemoveButton onClick={() => onChange(stats.filter((_, idx) => idx !== i))} title="Eliminar cifra" />
        </div>
      ))}
    </div>
  )
}

// ─── Formación ──────────────────────────────────────────────────────────

function EducationFields({
  education,
  onChange,
}: {
  education: LegadoEducation[]
  onChange: (e: LegadoEducation[]) => void
}) {
  const add = () => onChange([...education, { id: `edu-${Date.now()}`, title: "", institution: "", year: "" }])
  const set = (i: number, changes: Partial<LegadoEducation>) =>
    onChange(education.map((e, idx) => (idx === i ? { ...e, ...changes } : e)))

  return (
    <div className="space-y-2">
      <SectionHeader title="Formación y estudios" onAdd={add} />
      {education.map((edu, i) => (
        <div key={edu.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={edu.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Ej. Composición musical"
            />
            <RemoveButton onClick={() => onChange(education.filter((_, idx) => idx !== i))} title="Eliminar" />
          </div>
          <div className="flex gap-2">
            <TextInput
              value={edu.institution}
              onChange={(e) => set(i, { institution: e.target.value })}
              placeholder="Institución / maestro"
            />
            <TextInput
              value={edu.year}
              onChange={(e) => set(i, { year: e.target.value })}
              placeholder="2018 — 2022"
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Premios ────────────────────────────────────────────────────────────

function AwardsFields({ awards, onChange }: { awards: LegadoAward[]; onChange: (a: LegadoAward[]) => void }) {
  const add = () => onChange([...awards, { id: `award-${Date.now()}`, title: "", org: "", year: "" }])
  const set = (i: number, changes: Partial<LegadoAward>) =>
    onChange(awards.map((a, idx) => (idx === i ? { ...a, ...changes } : a)))

  return (
    <div className="space-y-2">
      <SectionHeader title="Premios y reconocimientos" onAdd={add} />
      {awards.map((award, i) => (
        <div key={award.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={award.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Ej. Mejor artista nuevo"
            />
            <RemoveButton onClick={() => onChange(awards.filter((_, idx) => idx !== i))} title="Eliminar" />
          </div>
          <div className="flex gap-2">
            <TextInput
              value={award.org}
              onChange={(e) => set(i, { org: e.target.value })}
              placeholder="Quién lo otorgó"
            />
            <TextInput value={award.year} onChange={(e) => set(i, { year: e.target.value })} placeholder="Año" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Prensa ─────────────────────────────────────────────────────────────

function PressFields({ press, onChange }: { press: LegadoPress[]; onChange: (p: LegadoPress[]) => void }) {
  const add = () => onChange([...press, { id: `press-${Date.now()}`, quote: "", source: "", url: "" }])
  const set = (i: number, changes: Partial<LegadoPress>) =>
    onChange(press.map((p, idx) => (idx === i ? { ...p, ...changes } : p)))

  return (
    <div className="space-y-2">
      <SectionHeader title="Prensa — qué dicen de ti" onAdd={add} />
      {press.map((quote, i) => (
        <div key={quote.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <textarea
              value={quote.quote}
              onChange={(e) => set(i, { quote: e.target.value })}
              rows={2}
              className={inputClass}
              placeholder="La cita, sin comillas"
            />
            <RemoveButton onClick={() => onChange(press.filter((_, idx) => idx !== i))} title="Eliminar cita" />
          </div>
          <div className="flex gap-2">
            <TextInput
              value={quote.source}
              onChange={(e) => set(i, { source: e.target.value })}
              placeholder="Medio o persona"
            />
            <TextInput
              value={quote.url || ""}
              onChange={(e) => set(i, { url: e.target.value })}
              placeholder="Enlace (opcional)"
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Shows destacados ───────────────────────────────────────────────────

function ShowsFields({ shows, onChange }: { shows: LegadoShow[]; onChange: (s: LegadoShow[]) => void }) {
  const add = () => onChange([...shows, { id: `show-${Date.now()}`, name: "", venue: "", city: "", year: "" }])
  const set = (i: number, changes: Partial<LegadoShow>) =>
    onChange(shows.map((s, idx) => (idx === i ? { ...s, ...changes } : s)))

  return (
    <div className="space-y-2">
      <SectionHeader title="Escenarios y shows destacados" onAdd={add} />
      {shows.map((show, i) => (
        <div key={show.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <TextInput
              value={show.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder="Festival / gira / evento"
            />
            <RemoveButton onClick={() => onChange(shows.filter((_, idx) => idx !== i))} title="Eliminar show" />
          </div>
          <div className="flex gap-2">
            <TextInput
              value={show.venue}
              onChange={(e) => set(i, { venue: e.target.value })}
              placeholder="Recinto"
            />
            <TextInput value={show.city} onChange={(e) => set(i, { city: e.target.value })} placeholder="Ciudad" />
            <TextInput value={show.year} onChange={(e) => set(i, { year: e.target.value })} placeholder="Año" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Galería de referencia (con fotos recortadas 3D) ────────────────────

function GalleryFields({
  gallery,
  onChange,
  blobRegistry,
}: {
  gallery: LegadoGalleryItem[]
  onChange: (gallery: LegadoGalleryItem[]) => void
  blobRegistry: BlobRegistry
}) {
  const addImage = () => onChange([...gallery, { url: "" }])
  const set = (index: number, changes: Partial<LegadoGalleryItem>) =>
    onChange(gallery.map((g, i) => (i === index ? { ...g, ...changes } : g)))
  const removeImage = (index: number) => onChange(gallery.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <SectionHeader title="Galería (fotos de prensa/shows)" onAdd={addImage} />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Las dos primeras fotos van al bento principal. Marca “Sin fondo” en fotos PNG con
        transparencia para que floten en 3D con sombra propia.
      </p>

      {gallery.map((item, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <ImageUploader
                currentImageUrl={item.url}
                onUploadReady={(newUrl) => set(index, { url: newUrl })}
                blobRegistry={blobRegistry}
              />
            </div>
            <RemoveButton onClick={() => removeImage(index)} title="Eliminar foto" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground">
              <input
                type="checkbox"
                checked={Boolean(item.cutout)}
                onChange={(e) => set(index, { cutout: e.target.checked })}
                className="size-3.5 accent-[var(--primary)]"
              />
              Sin fondo (flota en 3D)
            </label>
            <TextInput
              value={item.caption || ""}
              onChange={(e) => set(index, { caption: e.target.value })}
              placeholder="Leyenda (opcional)"
            />
          </div>
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
        label="Instrumentos y habilidades"
        values={data.instruments ?? []}
        onChange={(instruments) => onChange({ ...data, instruments })}
        placeholder="Ej. Guitarra, Ableton, Dirección coral"
      />
      <TagListEditor
        label="Influencias"
        values={data.influences}
        onChange={(influences) => onChange({ ...data, influences })}
        placeholder="Ej. Los Ángeles Azules"
      />
      <StatsFields stats={data.stats ?? []} onChange={(stats) => onChange({ ...data, stats })} />
      <TimelineFields
        timeline={data.timeline}
        onChange={(timeline) => onChange({ ...data, timeline })}
        blobRegistry={blobRegistry}
      />
      <EducationFields education={data.education ?? []} onChange={(education) => onChange({ ...data, education })} />
      <AwardsFields awards={data.awards ?? []} onChange={(awards) => onChange({ ...data, awards })} />
      <PressFields press={data.press ?? []} onChange={(press) => onChange({ ...data, press })} />
      <ShowsFields shows={data.shows ?? []} onChange={(shows) => onChange({ ...data, shows })} />
      <GalleryFields
        gallery={(data.gallery ?? []).map((g) => (typeof g === "string" ? { url: g } : g))}
        onChange={(gallery) => onChange({ ...data, gallery })}
        blobRegistry={blobRegistry}
      />
    </>
  )
}

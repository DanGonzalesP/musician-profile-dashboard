"use client"

import { useMemo, useState } from "react"
import { Upload, Video } from "lucide-react"
import {
  computePublicacionRows,
  PUBLICACIONES_DEFAULT_ROW_TITLES,
  PUBLICACIONES_MAX_ITEMS,
  PUBLICACIONES_ROWS,
  type PublicacionesData,
  type PublicacionItem,
} from "@/lib/blocks"
import { Field, TextInput, ImageUploader, type BlobRegistry } from "@/components/block-inspector"
import { EmbedsFields } from "@/components/inspector/embeds-fields"
import { ItemPager } from "@/components/inspector/item-pager"

// ─── VideoUploader — mismo patrón que ImageUploader/AudioUploader, sin
// transcodificación (el video se sube tal cual a la carpeta "video" de R2) ──

const MAX_VIDEO_FILE_SIZE_MB = 150
const MAX_VIDEO_FILE_SIZE_BYTES = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024

function VideoUploader({
  onUploadReady,
  currentVideoUrl,
  blobRegistry,
}: {
  onUploadReady: (blobUrl: string) => void
  currentVideoUrl?: string
  blobRegistry: BlobRegistry
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    if (!file.type.startsWith("video/")) {
      setError("Formato no reconocido. Subí un archivo de video (.mp4, .mov, .webm).")
      e.target.value = ""
      return
    }

    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      setError(`El archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB. El máximo permitido es ${MAX_VIDEO_FILE_SIZE_MB}MB.`)
      e.target.value = ""
      return
    }

    setError(null)
    const blobUrl = URL.createObjectURL(file)
    blobRegistry.current.set(blobUrl, file)
    setFileName(file.name)
    onUploadReady(blobUrl)
    e.target.value = ""
  }

  const hasVideo = Boolean(fileName || currentVideoUrl)
  const displayName = fileName || (currentVideoUrl ? "Video cargado ✓" : null)

  return (
    <div className="space-y-1.5">
      {displayName && (
        <p className="flex items-center gap-1.5 truncate rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          <Video className="size-3 shrink-0" />
          <span className="truncate">{displayName}</span>
        </p>
      )}
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors ${
          hasVideo
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-input bg-background text-foreground hover:bg-accent"
        }`}
      >
        <Upload className="size-3.5 text-muted-foreground" />
        <span>Subir video (mp4, mov, webm)</span>
        <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
      </label>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────

export function PublicacionesFields({
  data,
  onChange,
  blobRegistry,
  isBand = false,
}: {
  data: PublicacionesData
  onChange: (d: PublicacionesData) => void
  blobRegistry: BlobRegistry
  isBand?: boolean
}) {
  const items = data.items
  const rowTitles = data.rowTitles?.length ? data.rowTitles : [...PUBLICACIONES_DEFAULT_ROW_TITLES]
  const atLimit = !isBand && items.length >= PUBLICACIONES_MAX_ITEMS

  // Fila que se está editando ahora mismo — el pager de abajo solo muestra
  // (y agrega/quita) publicaciones de ESTA fila, así queda claro a cuál de
  // las 3 secciones del carrusel público pertenece cada una.
  const [activeRow, setActiveRow] = useState(0)

  // Índices REALES (dentro de `items`) que pertenecen a la fila activa, en
  // orden — el pager navega sobre este subconjunto, no sobre la lista entera.
  const rowIndices = useMemo(() => {
    const rowOf = computePublicacionRows(items)
    return items.map((_, i) => i).filter((i) => rowOf[i] === activeRow)
  }, [items, activeRow])

  const rowCounts = useMemo(() => {
    const rowOf = computePublicacionRows(items)
    return Array.from({ length: PUBLICACIONES_ROWS }, (_, r) => rowOf.filter((x) => x === r).length)
  }, [items])

  const addItem = () => {
    if (atLimit) return
    onChange({
      ...data,
      items: [...items, { id: `pub-${Date.now()}`, type: "image", url: "", thumbnail: "", caption: "", row: activeRow }],
    })
  }

  const setItem = (subIndex: number, changes: Partial<PublicacionItem>) => {
    const realIndex = rowIndices[subIndex]
    if (realIndex === undefined) return
    onChange({ ...data, items: items.map((it, i) => (i === realIndex ? { ...it, ...changes } : it)) })
  }

  const removeItem = (subIndex: number) => {
    const realIndex = rowIndices[subIndex]
    if (realIndex === undefined) return
    onChange({ ...data, items: items.filter((_, i) => i !== realIndex) })
  }

  const setRowTitle = (rowIndex: number, title: string) => {
    const next = [...rowTitles]
    next[rowIndex] = title
    onChange({ ...data, rowTitles: next })
  }

  return (
    <div className="space-y-2">
      {/* Subtítulos de las 3 filas del carrusel público */}
      <div className="space-y-1.5 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Subtítulos de las filas ({PUBLICACIONES_ROWS} carruseles de 3)
        </p>
        {Array.from({ length: PUBLICACIONES_ROWS }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-[11px] font-bold text-primary/70">
              {i + 1}.
            </span>
            <TextInput
              value={rowTitles[i] ?? ""}
              onChange={(e) => setRowTitle(i, e.target.value)}
              placeholder={PUBLICACIONES_DEFAULT_ROW_TITLES[i]}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {isBand ? `${items.length} publicaciones` : `${items.length} / ${PUBLICACIONES_MAX_ITEMS} publicaciones`}
      </p>

      {/* Selector de fila: cada botón es una de las 3 secciones del carrusel
          público (mismos nombres que los subtítulos de arriba). Elegir una
          filtra el pager de abajo para mostrar SOLO sus publicaciones. */}
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: PUBLICACIONES_ROWS }, (_, r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRow(r)}
            className={`flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center transition-colors ${
              activeRow === r
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-sidebar-border bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide">{r + 1}.</span>
            <span className="w-full truncate text-[11px] font-medium">
              {rowTitles[r] || PUBLICACIONES_DEFAULT_ROW_TITLES[r]}
            </span>
            <span className="text-[10px] tabular-nums opacity-70">{rowCounts[r]}</span>
          </button>
        ))}
      </div>

      <ItemPager
        key={activeRow}
        label="Publicación"
        count={rowIndices.length}
        onAdd={addItem}
        onRemove={removeItem}
        addLabel="Agregar"
        emptyLabel="Añade la primera foto o video de esta fila."
        canAdd={!atLimit}
        disabledAddHint={`Llegaste al máximo gratuito de ${PUBLICACIONES_MAX_ITEMS}. Elegí tus mejores fotos y videos.`}
      >
        {(subIndex) => {
          const item = items[rowIndices[subIndex]]
          if (!item) return null
          return (
            <>
              <div className="flex gap-1 rounded-lg border border-sidebar-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setItem(subIndex, { type: "image" })}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    item.type === "image" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Foto
                </button>
                <button
                  type="button"
                  onClick={() => setItem(subIndex, { type: "video" })}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    item.type === "video" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Video
                </button>
              </div>

              {item.type === "image" ? (
                <ImageUploader
                  currentImageUrl={item.url}
                  onUploadReady={(url) => setItem(subIndex, { url })}
                  blobRegistry={blobRegistry}
                  aspect={3 / 4}
                />
              ) : (
                <>
                  <VideoUploader
                    currentVideoUrl={item.url}
                    onUploadReady={(url) => setItem(subIndex, { url })}
                    blobRegistry={blobRegistry}
                  />
                  <Field label="Miniatura (opcional)">
                    <ImageUploader
                      currentImageUrl={item.thumbnail}
                      onUploadReady={(url) => setItem(subIndex, { thumbnail: url })}
                      blobRegistry={blobRegistry}
                      aspect={3 / 4}
                    />
                  </Field>
                </>
              )}

              <TextInput
                value={item.caption || ""}
                onChange={(e) => setItem(subIndex, { caption: e.target.value })}
                placeholder="Descripción corta (opcional)"
              />
            </>
          )
        }}
      </ItemPager>

      {/* Embeds (YouTube/TikTok) — misma sección que Publicaciones: se
          muestran como filas extra al final del bloque público. */}
      <EmbedsFields
        data={{ items: data.embeds ?? [] }}
        onChange={(embedsData) => onChange({ ...data, embeds: embedsData.items })}
        blobRegistry={blobRegistry}
      />
    </div>
  )
}

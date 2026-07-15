"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import type { Block, HeroData, SingleData, CrowdfundingData, TracksData, CatalogData, CreditsData, CreditItem, CreditRole, MerchData, ServiceData, DonationData, Album, Track, ReleaseType, SocialLink, SocialPlatform } from "@/lib/blocks"
import { BLOCK_LIBRARY } from "@/lib/blocks"
import { type CatalogProduct, type CatalogService, newProduct, newService } from "@/lib/catalog"
import { X, Trash2, Upload, Loader2, Plus, Music, Heart, Play, Pause, Disc3, Rocket, ArrowLeft, ArrowUp, ArrowDown } from "lucide-react"

function BackToPanelLink() {
  return (
    <Link
      href="/perfil/dashboard"
      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3" /> Volver al Panel
    </Link>
  )
}

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
      <div className="flex h-full flex-col">
        <div className="border-b border-sidebar-border px-4 py-3">
          <BackToPanelLink />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-foreground">Nada seleccionado</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Selecciona un bloque en el lienzo para editar su contenido aquí.
          </p>
        </div>
      </div>
    )
  }

  const def = BLOCK_LIBRARY.find((b) => b.type === block.type)
  const update = (data: Block["data"]) => onChange(block.id, data)

  return (
    <div className="flex h-full flex-col bg-sidebar text-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <div>
          <BackToPanelLink />
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary">Editando</p>
          <p className="text-sm font-semibold text-foreground">{def?.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel de edición"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {block.type === "hero" && (
          <HeroFields data={block.data as HeroData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "single" && (
          <SingleFields data={block.data as SingleData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "crowdfunding" && (
          <CrowdfundingFields data={block.data as CrowdfundingData} onChange={update} />
        )}
        {block.type === "tracks" && (
          <TracksFields data={block.data as TracksData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "catalog" && (
          <CatalogFields data={block.data as CatalogData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "credits" && (
          <CreditsFields data={block.data as CreditsData} onChange={update} />
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
          Eliminar bloque
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
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"

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
          <img src={displayUrl} alt="Vista previa" className="h-full w-full object-cover" />
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
  onUploadReady: (blobUrl: string, fileHash: string) => void
  currentAudioUrl?: string
  blobRegistry: BlobRegistry
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hashing, setHashing] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    // Solo aceptamos .mp3: formatos pesados como .wav/.flac saturarían el
    // almacenamiento, así que se rechazan aquí mismo, antes de registrar
    // el archivo o generar ningún blob URL.
    // La validación por nombre de archivo sola era demasiado estricta: un
    // nombre con espacios al final, mayúsculas, o sin extensión visible (el
    // navegador a veces la omite al venir de un recorte/exportación) hacía
    // que un .mp3 real fuera rechazado. Ahora también se acepta si el
    // navegador reporta un MIME de audio mp3, aunque el nombre no sea claro.
    const rawName = file.name.trim()
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase().trim() : ""
    const mimeIsMp3 = /mpeg|mp3/i.test(file.type)
    if (ext !== "mp3" && !mimeIsMp3) {
      setError("Solo se aceptan archivos .mp3. Sube un audio optimizado para la web.")
      e.target.value = ""
      return
    }

    setError(null)

    // Huella SHA-256 calculada aquí mismo, en el navegador, antes de que el
    // archivo toque Supabase — es la base del certificado de autoría.
    setHashing(true)
    let fileHash = ""
    try {
      const { sha256File } = await import("@/lib/audio-hash")
      fileHash = await sha256File(file)
    } catch (err) {
      console.error("[AudioUploader] No se pudo calcular el hash SHA-256:", err)
    } finally {
      setHashing(false)
    }

    const blobUrl = URL.createObjectURL(file)
    blobRegistry.current.set(blobUrl, file)

    setFileName(file.name)
    onUploadReady(blobUrl, fileHash)
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
      {hashing && <p className="text-[11px] text-muted-foreground">Calculando huella digital SHA-256...</p>}
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors ${
          hasAudio
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-input bg-background text-foreground hover:bg-accent"
        }`}
      >
        <Music className="size-3.5 text-muted-foreground" />
        <span>Subir audio (.mp3)</span>
        <input type="file" accept=".mp3,audio/mpeg" onChange={handleFileChange} className="hidden" />
      </label>
    </div>
  )
}

// ─── HeroFields ───────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter / X" },
  { value: "spotify", label: "Spotify" },
  { value: "bandcamp", label: "Bandcamp" },
]

function SocialLinksFields({
  socials,
  onChange,
}: {
  socials: SocialLink[]
  onChange: (socials: SocialLink[]) => void
}) {
  const addSocial = () => {
    onChange([...socials, { platform: "instagram", label: "", href: "" }])
  }

  const setSocial = (index: number, changes: Partial<SocialLink>) => {
    onChange(socials.map((s, i) => (i === index ? { ...s, ...changes } : s)))
  }

  const removeSocial = (index: number) => {
    onChange(socials.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
        <button
          type="button"
          onClick={addSocial}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar enlace
        </button>
      </div>

      {socials.map((social, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-sidebar-border p-2.5 bg-background/50">
          <div className="flex items-center justify-between gap-2">
            <select
              value={social.platform}
              onChange={(e) => setSocial(index, { platform: e.target.value as SocialPlatform })}
              className={inputClass}
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeSocial(index)}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Eliminar red social"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <TextInput
            value={social.label}
            onChange={(e) => setSocial(index, { label: e.target.value })}
            placeholder="Texto a mostrar, ej. @novareyes"
          />
          <TextInput
            value={social.href}
            onChange={(e) => setSocial(index, { href: e.target.value })}
            placeholder="https://..."
          />
        </div>
      ))}
    </div>
  )
}

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
      <Field label="Nombre del artista">
        <TextInput value={data.name || ""} onChange={(e) => onChange({ ...data, name: e.target.value })} />
      </Field>
      <Field label="Foto de perfil (avatar)">
        <ImageUploader
          currentImageUrl={data.image}
          onUploadReady={(url) => onChange({ ...data, image: url })}
          blobRegistry={blobRegistry}
        />
      </Field>
      <Field label="Banner de fondo">
        <ImageUploader
          currentImageUrl={data.banner}
          onUploadReady={(url) => onChange({ ...data, banner: url })}
          blobRegistry={blobRegistry}
        />
      </Field>
      <Field label="Frase de presentación">
        <textarea
          value={data.tagline || ""}
          onChange={(e) => onChange({ ...data, tagline: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </Field>
      <Field label="Ubicación">
        <TextInput value={data.location || ""} onChange={(e) => onChange({ ...data, location: e.target.value })} />
      </Field>
      <Field label="Oyentes mensuales (opcional)">
        <TextInput
          value={data.monthlyListeners || ""}
          onChange={(e) => onChange({ ...data, monthlyListeners: e.target.value })}
          placeholder="Ej. 12,400 oyentes mensuales"
        />
      </Field>
      <SocialLinksFields
        socials={data.socials || []}
        onChange={(socials) => onChange({ ...data, socials })}
      />
    </>
  )
}

// ─── TracksFields — gestión de álbumes y pistas ────────────────────────────

function extractAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) {
        resolve(audio.duration)
        return
      }
      // Bug conocido de Chrome al leer blob URLs: la duración llega como
      // Infinity hasta que se fuerza una búsqueda (seek) dentro del archivo.
      audio.currentTime = 1e101
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null
        audio.currentTime = 0
        resolve(audio.duration)
      }
    }
    audio.onerror = () => reject(new Error("No se pudo leer la duración del audio"))
    audio.src = url
  })
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return ""
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ─── SingleFields — el lanzamiento actual / single destacado ──────────────

function SingleFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: SingleData
  onChange: (d: SingleData) => void
  blobRegistry: BlobRegistry
}) {
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const handleAudioUploaded = async (url: string) => {
    // Igual que en TracksFields: audioUrl y duration se guardan juntos en una
    // sola actualización para no pisar el estado con una copia vieja.
    let duration = ""
    try {
      duration = formatDuration(await extractAudioDuration(url))
    } catch {
      // Sin metadata legible: se deja vacío, el artista puede escribirla luego.
    }
    onChange({ ...data, audioUrl: url, duration })
  }

  const togglePreview = () => {
    if (!data.audioUrl) return
    if (isPreviewing && previewAudioRef.current?.src === data.audioUrl) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setIsPreviewing(false)
      return
    }
    previewAudioRef.current?.pause()
    const audio = new Audio(data.audioUrl)
    previewAudioRef.current = audio
    setIsPreviewing(true)
    audio.onended = () => setIsPreviewing(false)
    audio.onerror = () => setIsPreviewing(false)
    audio.play().catch(() => setIsPreviewing(false))
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">
        <Disc3 className="size-3.5 shrink-0" />
        <span>Lanzamiento Actual — el single que se destaca al tope de tu perfil</span>
      </div>
      <Field label="Título de la canción">
        <TextInput
          value={data.title || ""}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Ej. Neon Horizon"
        />
      </Field>
      <div className="flex gap-2">
        <Field label="Género">
          <TextInput
            value={data.genre || ""}
            onChange={(e) => onChange({ ...data, genre: e.target.value })}
            placeholder="Ej. Synth Pop"
          />
        </Field>
        <Field label="Año">
          <TextInput
            value={data.year || ""}
            onChange={(e) => onChange({ ...data, year: e.target.value })}
            placeholder="Ej. 2026"
          />
        </Field>
      </div>
      <Field label="Portada">
        <ImageUploader
          currentImageUrl={data.cover}
          onUploadReady={(url) => onChange({ ...data, cover: url })}
          blobRegistry={blobRegistry}
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePreview}
          disabled={!data.audioUrl}
          title={data.audioUrl ? "Escuchar antes de publicar" : "Sube un audio para poder escucharlo"}
          aria-label={isPreviewing ? "Pausar preescucha" : "Escuchar antes de publicar"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-input disabled:bg-transparent disabled:text-muted-foreground/40 disabled:opacity-60"
        >
          {isPreviewing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        {data.duration && (
          <span
            title="Calculado automáticamente al subir el audio"
            aria-label={`Duración: ${data.duration}`}
            className="ml-auto shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground"
          >
            {data.duration}
          </span>
        )}
      </div>
      <AudioUploader
        currentAudioUrl={data.audioUrl}
        onUploadReady={(url) => handleAudioUploaded(url)}
        blobRegistry={blobRegistry}
      />
      <Field label="Descripción (opcional)">
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Cuenta la historia detrás de esta canción: en qué te inspiraste, dónde la grabaste..."
        />
      </Field>
    </>
  )
}

// ─── CrowdfundingFields — meta de producción / crowdfunding ────────────────

const STUDIO_OPTIONS = ["Estudio A", "Estudio B", "Estudio C"]

function CrowdfundingFields({
  data,
  onChange,
}: {
  data: CrowdfundingData
  onChange: (d: CrowdfundingData) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">
        <Rocket className="size-3.5 shrink-0" />
        <span>Meta de Producción — campaña de recaudación para tu próxima grabación</span>
      </div>
      <Field label="Título de la campaña">
        <TextInput
          value={data.title || ""}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Ej. Grabar mi nuevo EP en Estudio SonidoX"
        />
      </Field>
      <Field label="Descripción">
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Cuéntale a tus fans para qué es esta grabación..."
        />
      </Field>
      <Field label="Estudio aliado">
        <select
          value={data.chosenStudio || ""}
          onChange={(e) => onChange({ ...data, chosenStudio: e.target.value })}
          className={inputClass}
        >
          <option value="">Selecciona un estudio</option>
          {STUDIO_OPTIONS.map((studio) => (
            <option key={studio} value={studio}>
              {studio}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Field label="Monto objetivo">
          <TextInput
            type="number"
            min="0"
            value={data.targetAmount || ""}
            onChange={(e) => onChange({ ...data, targetAmount: e.target.value })}
            placeholder="5000"
          />
        </Field>
        <Field label="Días restantes">
          <TextInput
            type="number"
            min="0"
            value={data.daysLeft || ""}
            onChange={(e) => onChange({ ...data, daysLeft: e.target.value })}
            placeholder="30"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Field label="Monto ya recaudado">
          <TextInput type="number" disabled value={data.currentAmount || "0"} />
        </Field>
        <Field label="Personas que ya aportaron">
          <TextInput type="number" disabled value={data.backerCount || "0"} />
        </Field>
      </div>
      <Field label="Personas en espera (hype)">
        <TextInput type="number" disabled value={data.hypeCount || "0"} />
      </Field>
      <p className="-mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Los tres contadores de arriba se calcularán automáticamente con las interacciones reales de tus fans —
        aquí solo se muestran como referencia. Mientras no haya pasarela de pago real conectada, cada visitante
        ve estos números sumados con sus propias interacciones simuladas de esa sesión.
      </p>
    </>
  )
}

function TracksFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: TracksData
  onChange: (d: TracksData) => void
  blobRegistry: BlobRegistry
}) {
  const albums = data.albums || []
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  // Solo un álbum se edita a la vez — evita el scroll largo de mostrarlos todos juntos.
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(albums[0]?.id ?? null)

  const updateAlbums = (next: Album[]) => onChange({ albums: next })

  const setAlbum = (albumIndex: number, changes: Partial<Album>) => {
    updateAlbums(albums.map((a, idx) => (idx === albumIndex ? { ...a, ...changes } : a)))
  }

  const addAlbum = () => {
    const newAlbum: Album = { id: `album-${Date.now()}`, title: "Nuevo Álbum", cover: "", tracks: [] }
    updateAlbums([...albums, newAlbum])
    setActiveAlbumId(newAlbum.id)
  }

  const removeAlbum = (albumIndex: number) => {
    const removedId = albums[albumIndex]?.id
    const next = albums.filter((_, idx) => idx !== albumIndex)
    updateAlbums(next)
    if (removedId === activeAlbumId) {
      setActiveAlbumId(next[0]?.id ?? null)
    }
  }

  // Al abrir el editor, cualquier pista que ya tenga audio pero no tenga
  // duración calculada (ej. las pistas de ejemplo, o datos cargados desde la
  // base de datos) la calcula automáticamente leyendo la metadata real del
  // audio. Así la duración nunca es un número inventado — solo aparece
  // cuando realmente se puede leer del archivo.
  useEffect(() => {
    let cancelled = false

    async function fillMissingDurations() {
      const updates: { albumIndex: number; trackIndex: number; duration: string }[] = []

      for (let aIdx = 0; aIdx < albums.length; aIdx++) {
        const tracks = albums[aIdx].tracks
        for (let tIdx = 0; tIdx < tracks.length; tIdx++) {
          const track = tracks[tIdx]
          if (track.audioUrl && !track.duration) {
            try {
              const seconds = await extractAudioDuration(track.audioUrl)
              updates.push({ albumIndex: aIdx, trackIndex: tIdx, duration: formatDuration(seconds) })
            } catch {
              // Sin metadata legible: se deja vacío, el artista puede escribirla luego.
            }
          }
        }
      }

      if (cancelled || updates.length === 0) return

      updateAlbums(
        albums.map((a, aIdx) => ({
          ...a,
          tracks: a.tracks.map((t, tIdx) => {
            const match = updates.find((u) => u.albumIndex === aIdx && u.trackIndex === tIdx)
            return match ? { ...t, duration: match.duration } : t
          }),
        }))
      )
    }

    fillMissingDurations()
    return () => {
      cancelled = true
    }
    // Solo debe correr una vez, al abrir el editor de este bloque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTrackFields = (albumIndex: number, trackIndex: number, changes: Partial<Track>) => {
    updateAlbums(
      albums.map((a, aIdx) =>
        aIdx === albumIndex
          ? { ...a, tracks: a.tracks.map((t, tIdx) => (tIdx === trackIndex ? { ...t, ...changes } : t)) }
          : a
      )
    )
  }

  const setTrack = (albumIndex: number, trackIndex: number, key: keyof Track, value: string) =>
    setTrackFields(albumIndex, trackIndex, { [key]: value })

  const addTrack = (albumIndex: number) => {
    updateAlbums(
      albums.map((a, idx) =>
        idx === albumIndex ? { ...a, tracks: [...a.tracks, { title: "Nueva Pista", duration: "" }] } : a
      )
    )
  }

  const removeTrack = (albumIndex: number, trackIndex: number) => {
    updateAlbums(
      albums.map((a, idx) =>
        idx === albumIndex ? { ...a, tracks: a.tracks.filter((_, tIdx) => tIdx !== trackIndex) } : a
      )
    )
  }

  const handleAudioUploaded = async (albumIndex: number, trackIndex: number, url: string, fileHash: string) => {
    // Ambos campos se guardan juntos en una sola actualización. Si se guardaran
    // por separado (audioUrl primero, duration después de esperar la metadata),
    // el segundo guardado usaría una copia vieja del estado y borraría la URL
    // recién guardada — eso causaba que el audio "desapareciera" tras subirlo.
    let duration = ""
    try {
      duration = formatDuration(await extractAudioDuration(url))
    } catch {
      // Si el navegador no puede leer la metadata, se deja la duración vacía
      // y el artista puede escribirla manualmente.
    }
    // Esta es música real del artista: el álbum deja de ser "Ejemplo" y los
    // demás álbumes de ejemplo se retiran automáticamente.
    const targetId = albums[albumIndex]?.id
    const updated = albums.map((a, aIdx) =>
      aIdx === albumIndex
        ? {
            ...a,
            isExample: false,
            tracks: a.tracks.map((t, tIdx) =>
              tIdx === trackIndex ? { ...t, audioUrl: url, duration, fileHash } : t
            ),
          }
        : a
    )
    updateAlbums(updated.filter((a) => a.id === targetId || !a.isExample))
  }

  const togglePreview = (key: string, url?: string) => {
    if (!url) return
    // Comparar también el src real cargado, no solo la key de posición: si
    // el artista subió un audio nuevo para esta misma pista, previewingKey
    // sigue apuntando a esta posición pero el archivo cargado ya es el
    // viejo — en ese caso el clic debe cargar y sonar el archivo nuevo, no
    // limitarse a pausar el anterior.
    if (previewingKey === key && previewAudioRef.current?.src === url) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setPreviewingKey(null)
      return
    }
    previewAudioRef.current?.pause()
    const audio = new Audio(url)
    previewAudioRef.current = audio
    setPreviewingKey(key)
    audio.onended = () => setPreviewingKey(null)
    audio.onerror = () => setPreviewingKey(null)
    audio.play().catch(() => setPreviewingKey(null))
  }

  const activeAlbumIndex = Math.max(
    0,
    albums.findIndex((a) => a.id === activeAlbumId)
  )
  const activeAlbum = albums[activeAlbumIndex] ?? null

  return (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Álbumes</p>
        <button
          type="button"
          onClick={addAlbum}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar Álbum
        </button>
      </div>

      {/* Carrusel compacto para elegir qué álbum editar */}
      {albums.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              onClick={() => setActiveAlbumId(album.id)}
              className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-md p-1 transition-colors ${
                album.id === activeAlbum?.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent/50"
              }`}
            >
              <span className="flex size-10 w-full items-center justify-center overflow-hidden rounded bg-muted">
                {album.cover ? (
                  <img src={album.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Disc3 className="size-4 text-muted-foreground/40" />
                )}
              </span>
              <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                {album.title || "Sin título"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {activeAlbum && (
          <div key={activeAlbum.id} className="space-y-3 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Disc3 className="size-3.5" /> Álbum #{activeAlbumIndex + 1}
                {activeAlbum.isExample && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                    Ejemplo
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => removeAlbum(activeAlbumIndex)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Eliminar álbum"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            <Field label="Título del álbum">
              <TextInput
                value={activeAlbum.title || ""}
                onChange={(e) => setAlbum(activeAlbumIndex, { title: e.target.value })}
                placeholder="Ej. Digital Ethereal"
              />
            </Field>
            <Field label="Portada del álbum">
              <ImageUploader
                currentImageUrl={activeAlbum.cover}
                onUploadReady={(url) => setAlbum(activeAlbumIndex, { cover: url })}
                blobRegistry={blobRegistry}
              />
            </Field>

            <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pistas</p>
              <button
                type="button"
                onClick={() => addTrack(activeAlbumIndex)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus className="size-3" /> Agregar Pista
              </button>
            </div>

            <div className="space-y-2">
              {activeAlbum.tracks.map((track, trackIndex) => {
                const key = `${activeAlbumIndex}-${trackIndex}`
                const isPreviewing = previewingKey === key
                return (
                  <div key={trackIndex} className="space-y-2 rounded-lg border border-sidebar-border p-2.5 bg-sidebar/40">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Pista {trackIndex + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTrack(activeAlbumIndex, trackIndex)}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Eliminar pista"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={track.title || ""}
                      onChange={(e) => setTrack(activeAlbumIndex, trackIndex, "title", e.target.value)}
                      className={`${inputClass} w-full`}
                      placeholder="Nombre de la canción"
                      aria-label="Nombre de la canción"
                    />
                    <div>
                      <p className="mb-1 text-[10px] text-muted-foreground">
                        Imagen de la pista (opcional — si no subes una, se usa la portada del álbum)
                      </p>
                      <ImageUploader
                        currentImageUrl={track.image}
                        onUploadReady={(url) => setTrack(activeAlbumIndex, trackIndex, "image", url)}
                        blobRegistry={blobRegistry}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePreview(key, track.audioUrl)}
                        disabled={!track.audioUrl}
                        title={track.audioUrl ? "Escuchar antes de publicar" : "Sube un audio para poder escucharlo"}
                        aria-label={isPreviewing ? "Pausar preescucha" : "Escuchar antes de publicar"}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-input disabled:bg-transparent disabled:text-muted-foreground/40 disabled:opacity-60"
                      >
                        {isPreviewing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </button>
                      {track.duration && (
                        <span
                          title="Calculado automáticamente al subir el audio"
                          aria-label={`Duración: ${track.duration}`}
                          className="ml-auto shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground"
                        >
                          {track.duration}
                        </span>
                      )}
                    </div>
                    <AudioUploader
                      currentAudioUrl={track.audioUrl}
                      onUploadReady={(url, hash) => handleAudioUploaded(activeAlbumIndex, trackIndex, url, hash)}
                      blobRegistry={blobRegistry}
                    />
                    <textarea
                      value={track.description || ""}
                      onChange={(e) => setTrack(activeAlbumIndex, trackIndex, "description", e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Descripción (opcional): en qué te inspiraste, qué significa esta canción..."
                    />
                  </div>
                )
              })}
              {activeAlbum.tracks.length === 0 && (
                <p className="text-[11px] italic text-muted-foreground">Este álbum no tiene pistas todavía.</p>
              )}
            </div>
          </div>
        )}
        {albums.length === 0 && (
          <p className="text-[11px] italic text-muted-foreground">Añade tu primer álbum para empezar.</p>
        )}
      </div>
    </>
  )
}

// ─── CatalogFields — Bloque 3: carrusel de Álbumes/EPs/Singles ────────────
// Reutiliza el mismo tipo Album/Track del bloque "tracks" (extendido con
// releaseType/genre/year), así que el editor por-pista es casi idéntico al
// de TracksFields. La única diferencia real: un item "single" siempre tiene
// exactamente 1 pista y se edita con un solo AudioUploader, sin la lista de
// pistas múltiples.

const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: "Álbum",
  ep: "EP",
  single: "Single",
}

function CatalogFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: CatalogData
  onChange: (d: CatalogData) => void
  blobRegistry: BlobRegistry
}) {
  const albums = data.albums || []
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(albums[0]?.id ?? null)

  const updateAlbums = (next: Album[]) => onChange({ albums: next })

  const setAlbum = (albumIndex: number, changes: Partial<Album>) => {
    updateAlbums(albums.map((a, idx) => (idx === albumIndex ? { ...a, ...changes } : a)))
  }

  const addAlbum = () => {
    const newItem: Album = {
      id: `catalog-${Date.now()}`,
      title: "Nuevo Lanzamiento",
      cover: "",
      tracks: [],
      releaseType: "album",
      genre: "",
      year: "",
    }
    updateAlbums([...albums, newItem])
    setActiveAlbumId(newItem.id)
  }

  const removeAlbum = (albumIndex: number) => {
    const removedId = albums[albumIndex]?.id
    const next = albums.filter((_, idx) => idx !== albumIndex)
    updateAlbums(next)
    if (removedId === activeAlbumId) {
      setActiveAlbumId(next[0]?.id ?? null)
    }
  }

  const setReleaseType = (albumIndex: number, releaseType: ReleaseType) => {
    const current = albums[albumIndex]
    if (!current) return
    // Un "Single" siempre trae exactamente 1 pista — al cambiar a Single se
    // conserva la primera pista ya cargada (o se crea una vacía); al volver
    // a Álbum/EP las pistas existentes no se pierden.
    const tracks =
      releaseType === "single"
        ? current.tracks.length > 0
          ? [current.tracks[0]]
          : [{ title: current.title || "Nueva Pista", duration: "" }]
        : current.tracks
    setAlbum(albumIndex, { releaseType, tracks })
  }

  const setTrackFields = (albumIndex: number, trackIndex: number, changes: Partial<Track>) => {
    updateAlbums(
      albums.map((a, aIdx) =>
        aIdx === albumIndex
          ? { ...a, tracks: a.tracks.map((t, tIdx) => (tIdx === trackIndex ? { ...t, ...changes } : t)) }
          : a
      )
    )
  }

  const setTrack = (albumIndex: number, trackIndex: number, key: keyof Track, value: string) =>
    setTrackFields(albumIndex, trackIndex, { [key]: value })

  const addTrack = (albumIndex: number) => {
    updateAlbums(
      albums.map((a, idx) =>
        idx === albumIndex ? { ...a, tracks: [...a.tracks, { title: "Nueva Pista", duration: "" }] } : a
      )
    )
  }

  const removeTrack = (albumIndex: number, trackIndex: number) => {
    updateAlbums(
      albums.map((a, idx) =>
        idx === albumIndex ? { ...a, tracks: a.tracks.filter((_, tIdx) => tIdx !== trackIndex) } : a
      )
    )
  }

  const handleAudioUploaded = async (albumIndex: number, trackIndex: number, url: string, fileHash: string) => {
    let duration = ""
    try {
      duration = formatDuration(await extractAudioDuration(url))
    } catch {
      // Sin metadata legible: se deja vacío, el artista puede escribirla manualmente.
    }
    updateAlbums(
      albums.map((a, aIdx) =>
        aIdx === albumIndex
          ? {
              ...a,
              tracks: a.tracks.map((t, tIdx) =>
                tIdx === trackIndex ? { ...t, audioUrl: url, duration, fileHash } : t
              ),
            }
          : a
      )
    )
  }

  const togglePreview = (key: string, url?: string) => {
    if (!url) return
    if (previewingKey === key && previewAudioRef.current?.src === url) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setPreviewingKey(null)
      return
    }
    previewAudioRef.current?.pause()
    const audio = new Audio(url)
    previewAudioRef.current = audio
    setPreviewingKey(key)
    audio.onended = () => setPreviewingKey(null)
    audio.onerror = () => setPreviewingKey(null)
    audio.play().catch(() => setPreviewingKey(null))
  }

  const activeAlbumIndex = Math.max(
    0,
    albums.findIndex((a) => a.id === activeAlbumId)
  )
  const activeAlbum = albums[activeAlbumIndex] ?? null
  const isSingle = activeAlbum?.releaseType === "single"

  return (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Catálogo</p>
        <button
          type="button"
          onClick={addAlbum}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar Lanzamiento
        </button>
      </div>

      {albums.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              onClick={() => setActiveAlbumId(album.id)}
              className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-md p-1 transition-colors ${
                album.id === activeAlbum?.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent/50"
              }`}
            >
              <span className="flex size-10 w-full items-center justify-center overflow-hidden rounded bg-muted">
                {album.cover ? (
                  <img src={album.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Disc3 className="size-4 text-muted-foreground/40" />
                )}
              </span>
              <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                {album.title || "Sin título"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {activeAlbum && (
          <div key={activeAlbum.id} className="space-y-3 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Disc3 className="size-3.5" /> Lanzamiento #{activeAlbumIndex + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAlbum(activeAlbumIndex)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Eliminar lanzamiento"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            <Field label="Tipo">
              <select
                value={activeAlbum.releaseType || "album"}
                onChange={(e) => setReleaseType(activeAlbumIndex, e.target.value as ReleaseType)}
                className={inputClass}
              >
                {(["album", "ep", "single"] as ReleaseType[]).map((rt) => (
                  <option key={rt} value={rt}>
                    {RELEASE_TYPE_LABELS[rt]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Título">
              <TextInput
                value={activeAlbum.title || ""}
                onChange={(e) => setAlbum(activeAlbumIndex, { title: e.target.value })}
                placeholder="Ej. Digital Ethereal"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Género">
                <TextInput
                  value={activeAlbum.genre || ""}
                  onChange={(e) => setAlbum(activeAlbumIndex, { genre: e.target.value })}
                  placeholder="Ej. Synth Pop"
                />
              </Field>
              <Field label="Año">
                <TextInput
                  value={activeAlbum.year || ""}
                  onChange={(e) => setAlbum(activeAlbumIndex, { year: e.target.value })}
                  placeholder="Ej. 2026"
                />
              </Field>
            </div>

            <Field label="Portada">
              <ImageUploader
                currentImageUrl={activeAlbum.cover}
                onUploadReady={(url) => setAlbum(activeAlbumIndex, { cover: url })}
                blobRegistry={blobRegistry}
              />
            </Field>

            {isSingle ? (
              <div className="space-y-2 rounded-lg border border-sidebar-border p-2.5 bg-sidebar/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audio</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePreview(`${activeAlbumIndex}-0`, activeAlbum.tracks[0]?.audioUrl)}
                    disabled={!activeAlbum.tracks[0]?.audioUrl}
                    aria-label={
                      previewingKey === `${activeAlbumIndex}-0` ? "Pausar preescucha" : "Escuchar antes de publicar"
                    }
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-input disabled:bg-transparent disabled:text-muted-foreground/40 disabled:opacity-60"
                  >
                    {previewingKey === `${activeAlbumIndex}-0` ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </button>
                  {activeAlbum.tracks[0]?.duration && (
                    <span className="ml-auto shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground">
                      {activeAlbum.tracks[0].duration}
                    </span>
                  )}
                </div>
                <AudioUploader
                  currentAudioUrl={activeAlbum.tracks[0]?.audioUrl}
                  onUploadReady={(url, hash) => handleAudioUploaded(activeAlbumIndex, 0, url, hash)}
                  blobRegistry={blobRegistry}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pistas</p>
                  <button
                    type="button"
                    onClick={() => addTrack(activeAlbumIndex)}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Plus className="size-3" /> Agregar Pista
                  </button>
                </div>

                <div className="space-y-2">
                  {activeAlbum.tracks.map((track, trackIndex) => {
                    const key = `${activeAlbumIndex}-${trackIndex}`
                    const isPreviewing = previewingKey === key
                    return (
                      <div key={trackIndex} className="space-y-2 rounded-lg border border-sidebar-border p-2.5 bg-sidebar/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Pista {trackIndex + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeTrack(activeAlbumIndex, trackIndex)}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Eliminar pista"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={track.title || ""}
                          onChange={(e) => setTrack(activeAlbumIndex, trackIndex, "title", e.target.value)}
                          className={`${inputClass} w-full`}
                          placeholder="Nombre de la canción"
                          aria-label="Nombre de la canción"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePreview(key, track.audioUrl)}
                            disabled={!track.audioUrl}
                            aria-label={isPreviewing ? "Pausar preescucha" : "Escuchar antes de publicar"}
                            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-input disabled:bg-transparent disabled:text-muted-foreground/40 disabled:opacity-60"
                          >
                            {isPreviewing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          </button>
                          {track.duration && (
                            <span className="ml-auto shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground">
                              {track.duration}
                            </span>
                          )}
                        </div>
                        <AudioUploader
                          currentAudioUrl={track.audioUrl}
                          onUploadReady={(url, hash) => handleAudioUploaded(activeAlbumIndex, trackIndex, url, hash)}
                          blobRegistry={blobRegistry}
                        />
                      </div>
                    )
                  })}
                  {activeAlbum.tracks.length === 0 && (
                    <p className="text-[11px] italic text-muted-foreground">Este lanzamiento no tiene pistas todavía.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {albums.length === 0 && (
          <p className="text-[11px] italic text-muted-foreground">Añade tu primer álbum, EP o single para empezar.</p>
        )}
      </div>
    </>
  )
}

// ─── CreditsFields — créditos y colaboraciones en canciones de otros artistas

const CREDIT_ROLES: CreditRole[] = ["A", "C", "P", "R", "M", "V", "I"]

const CREDIT_ROLE_LABELS: Record<CreditRole, string> = {
  A: "Autor (Letra)",
  C: "Compositor (Música)",
  P: "Producción Musical",
  R: "Arreglista",
  M: "Músico de Sesión",
  V: "Vocalista",
  I: "Intérprete",
}

function CreditsFields({
  data,
  onChange,
}: {
  data: CreditsData
  onChange: (d: CreditsData) => void
}) {
  const credits = data.credits || []

  const updateCredits = (next: CreditItem[]) => onChange({ credits: next })

  const addCredit = () => {
    const newItem: CreditItem = {
      id: `credit-${Date.now()}`,
      title: "",
      mainArtist: "",
      role: "M",
      externalUrl: "",
    }
    updateCredits([...credits, newItem])
  }

  const setCredit = (index: number, changes: Partial<CreditItem>) => {
    updateCredits(credits.map((c, i) => (i === index ? { ...c, ...changes } : c)))
  }

  const removeCredit = (index: number) => {
    updateCredits(credits.filter((_, i) => i !== index))
  }

  const moveCredit = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= credits.length) return
    const next = [...credits]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateCredits(next)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Créditos</p>
        <button
          type="button"
          onClick={addCredit}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar Crédito
        </button>
      </div>

      <div className="space-y-3">
        {credits.map((credit, index) => (
          <div key={credit.id} className="space-y-2.5 rounded-lg border border-sidebar-border p-2.5 bg-background/50">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Crédito {index + 1}</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveCredit(index, -1)}
                  disabled={index === 0}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  title="Subir"
                  aria-label="Subir crédito"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCredit(index, 1)}
                  disabled={index === credits.length - 1}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  title="Bajar"
                  aria-label="Bajar crédito"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCredit(index)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Eliminar crédito"
                  aria-label="Eliminar crédito"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>

            <Field label="Título de la canción">
              <TextInput
                value={credit.title}
                onChange={(e) => setCredit(index, { title: e.target.value })}
                placeholder="Nombre de la canción"
              />
            </Field>

            <Field label="Artista principal">
              <TextInput
                value={credit.mainArtist}
                onChange={(e) => setCredit(index, { mainArtist: e.target.value })}
                placeholder="Nombre del artista"
              />
            </Field>

            <Field label="Tu rol">
              <select
                value={credit.role}
                onChange={(e) => setCredit(index, { role: e.target.value as CreditRole })}
                className={inputClass}
              >
                {CREDIT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {CREDIT_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Enlace externo (Spotify/YouTube, opcional)">
              <TextInput
                value={credit.externalUrl || ""}
                onChange={(e) => setCredit(index, { externalUrl: e.target.value })}
                placeholder="https://..."
              />
            </Field>
          </div>
        ))}

        {credits.length === 0 && (
          <p className="rounded-lg border border-dashed border-sidebar-border p-3 text-center text-xs text-muted-foreground">
            Añade tu primer crédito para empezar.
          </p>
        )}
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
      <Field label="Título de la sección">
        <TextInput value={data.title || ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Productos</p>
        <button
          type="button"
          onClick={addProduct}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar Producto
        </button>
      </div>
      <div className="space-y-4">
        {products.map((product, i) => (
          <div key={product.id} className="space-y-2 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Producto #{i + 1}</span>
              <button
                type="button"
                onClick={() => removeProduct(i)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <Field label="Nombre">
              <TextInput
                value={product.name || ""}
                onChange={(e) => setProduct(i, { name: e.target.value })}
                placeholder="Nombre del producto"
              />
            </Field>
            <Field label="Imagen">
              <ImageUploader
                currentImageUrl={product.imageUrl}
                onUploadReady={(url) => setProduct(i, { imageUrl: url })}
                blobRegistry={blobRegistry}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Precio">
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
      <Field label="Título de la sección">
        <TextInput value={data.title || ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between border-b border-sidebar-border pb-1.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ofertas</p>
        <button
          type="button"
          onClick={addService}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar Oferta
        </button>
      </div>
      <div className="space-y-3">
        {services.map((service, i) => (
          <div key={service.id} className="space-y-2 rounded-lg border border-sidebar-border p-3 bg-background/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Oferta #{i + 1}</span>
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
              placeholder="Título del servicio"
            />
            <TextInput
              value={service.price || ""}
              onChange={(e) => setService(i, "price", e.target.value)}
              placeholder="Precio"
            />
            <textarea
              value={service.description || ""}
              onChange={(e) => setService(i, "description", e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Descripción"
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
          placeholder="Apoya Mi Música"
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
            type="number"
            min="0"
            value={data.goalAmount || ""}
            onChange={(e) => onChange({ ...data, goalAmount: e.target.value })}
            placeholder="1000"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Field label="Monto ya recaudado">
          <TextInput type="number" disabled value={data.currentAmount || "0"} />
        </Field>
        <Field label="Fecha límite">
          <TextInput
            type="date"
            value={data.deadline || ""}
            onChange={(e) => onChange({ ...data, deadline: e.target.value })}
          />
        </Field>
      </div>
      <p className="-mt-4 text-[11px] leading-relaxed text-muted-foreground">
        El monto recaudado se calculará automáticamente con las transacciones reales de la pasarela de pago —
        aquí solo se muestra como referencia.
      </p>
      <Field label="Texto del botón">
        <TextInput
          value={data.buttonText || ""}
          onChange={(e) => onChange({ ...data, buttonText: e.target.value })}
          placeholder="Apoyar"
        />
      </Field>
    </>
  )
}


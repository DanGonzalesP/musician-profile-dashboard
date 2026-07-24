"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import type { Block, HeroData, SingleData, CrowdfundingData, TracksData, CreditsData, CreditItem, CreditRole, CreditSourceType, CreditStatus, MerchData, ServiceData, Album, Track, ReleaseType, SocialLink, SocialPlatform, LegadoData, PublicacionesData, EmbedsData } from "@/lib/blocks"
import { BLOCK_LIBRARY, SOCIAL_PLATFORM_LABELS } from "@/lib/blocks"
import {
  type CatalogProduct,
  type CatalogService,
  type ProductVariantGroup,
  newProduct,
  newService,
  PRODUCT_CATEGORIES,
  SERVICE_CATEGORIES,
  PRICE_UNITS,
  DURATION_UNITS,
  CURRENCIES,
  serviceHasDelivery,
} from "@/lib/catalog"
import * as audioEngine from "@/lib/audio-engine"
import { type AudioBitrate } from "@/lib/audio-transcode"
import { searchPlatformSongs, type PlatformSongResult } from "@/lib/song-search"
import { createCreditRequest, fetchCreditRequestStatuses } from "@/lib/credit-requests"
import { fetchOembedMetadata, detectOembedProvider, type OembedProvider } from "@/lib/oembed"
import { MUSICIAN_ROLES } from "@/lib/musician-roles"
import { X, Trash2, Loader2, Plus, Music, Play, Pause, Disc3, Rocket, ArrowLeft, Search, Move, ImagePlus, Check, AlertCircle } from "lucide-react"
import { resolveContactChannel, CONTACT_CHANNEL_ICONS, CONTACT_CHANNEL_LABELS } from "@/lib/contact-channel"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LegadoFields } from "@/components/inspector/legado-fields"
import { PublicacionesFields } from "@/components/inspector/publicaciones-fields"
import { EmbedsFields } from "@/components/inspector/embeds-fields"
import { LocationSelect } from "@/components/inspector/location-fields"
import { ItemPager } from "@/components/inspector/item-pager"
import { ImageAdjustModal } from "@/components/inspector/image-adjust-modal"
import { GenreSelect, YearSelect } from "@/components/inspector/genre-year-select"

function BackToPanelLink() {
  return (
    <Link
      href="/"
      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3" /> Volver al feed
    </Link>
  )
}

export type BlobRegistry = React.MutableRefObject<Map<string, File>>

// Bitrate de MP3 elegido por el artista para cada archivo de audio, keyeado
// por la instancia de File (no por su blob URL: la URL identifica el archivo
// ORIGINAL que se seleccionó, y eso es justo lo que hace falta recordar hasta
// el momento de publicar — ver uploadBlobFile en profile-editor.tsx). Un
// WeakMap evita mutar el File con una propiedad custom y se libera solo
// cuando el archivo deja de estar referenciado.
export const audioBitrateByFile = new WeakMap<File, AudioBitrate>()

type Props = {
  block: Block | null
  onChange: (id: string, data: Block["data"]) => void
  onDelete: (id: string) => void
  // El "banner principal" (hero) nunca se elimina del todo — vacía su
  // contenido en su lugar (ver confirmación antes de llamarlo).
  onClearContent: (id: string) => void
  blobRegistry: BlobRegistry
  products: CatalogProduct[]
  onProductsChange: (products: CatalogProduct[]) => void
  services: CatalogService[]
  onServicesChange: (services: CatalogService[]) => void
  profileId?: string | null
  isBand?: boolean
  // Cierra el panel en móvil (vuelve al lienzo sin navegar fuera del
  // editor) — en escritorio el panel es estático y esta prop no se usa.
  onClose?: () => void
  // Id del álbum que el usuario acaba de abrir en el lienzo (bloque
  // "tracks") — TracksFields lo usa para enfocar el mismo álbum acá.
  focusAlbumId?: string | null
}

export function BlockInspector({
  block,
  onChange,
  onDelete,
  onClearContent,
  blobRegistry,
  products,
  onProductsChange,
  services,
  onServicesChange,
  profileId,
  isBand = false,
  onClose,
  focusAlbumId,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    <div className="flex h-full flex-col text-foreground">
      <div className="gradient-border relative border-b border-sidebar-border/60 bg-sidebar/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <BackToPanelLink />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar y volver al lienzo"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground xl:hidden"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary">Editando</p>
        <p className="text-sm font-semibold text-foreground">{def?.label}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto bg-sidebar/40 p-4">
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
          <TracksFields
            data={block.data as TracksData}
            onChange={update}
            blobRegistry={blobRegistry}
            focusAlbumId={focusAlbumId}
          />
        )}
        {block.type === "credits" && (
          <CreditsFields
            data={block.data as CreditsData}
            onChange={update}
            profileId={profileId ?? null}
            blobRegistry={blobRegistry}
          />
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
            blobRegistry={blobRegistry}
          />
        )}
        {block.type === "legado" && (
          <LegadoFields data={block.data as LegadoData} onChange={update} blobRegistry={blobRegistry} />
        )}
        {block.type === "publicaciones" && (
          <PublicacionesFields
            data={block.data as PublicacionesData}
            onChange={update}
            blobRegistry={blobRegistry}
            isBand={isBand}
          />
        )}
        {block.type === "embeds" && (
          <EmbedsFields data={block.data as EmbedsData} onChange={update} blobRegistry={blobRegistry} />
        )}
      </div>

      <div className="border-t border-sidebar-border p-4 bg-sidebar">
        {/* Móvil (< xl): el panel es un overlay a pantalla completa que se
            abre para editar UN bloque — el CTA de abajo debe ser "guardar y
            volver", no un borrado grandote (eso ya se puede hacer desde el
            control pill del bloque en el lienzo, visible también en móvil).
            Los cambios ya se aplican en vivo con cada `onChange` y el
            autoguardado los sube solo; este botón solo cierra el panel. */}
        <button
          type="button"
          onClick={() => onClose?.()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-95 xl:hidden"
        >
          Guardar cambios
        </button>
        {/* Escritorio (xl+): panel estático sin botón de cerrar — el borrado
            se queda acá porque no hay "volver" que sirva de confirmación. */}
        <button
          type="button"
          onClick={() => (block.type === "hero" ? setConfirmClear(true) : setConfirmDelete(true))}
          className="hidden w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 xl:flex"
        >
          <Trash2 className="size-4" />
          {block.type === "hero" ? "Vaciar banner principal" : "Eliminar bloque"}
        </button>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="¿Vaciar el banner principal?"
          description="Se borrará todo el contenido de esta sección (nombre, frase, foto, redes) — el bloque se queda en tu página, pero vacío para que empieces de nuevo."
          confirmLabel="Vaciar contenido"
          onConfirm={() => {
            onClearContent(block.id)
            setConfirmClear(false)
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`¿Eliminar el bloque "${def?.label ?? "este bloque"}"?`}
          description="Se quitará esta sección de tu página con su contenido. Puedes volver a agregarla después desde la biblioteca de bloques."
          confirmLabel="Eliminar bloque"
          onConfirm={() => {
            onDelete(block.id)
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

// ─── Shared UI primitives ──────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={inputClass} />
}

// Textarea que crece con el texto en vez de mostrar una barra de scroll: al
// escribir, su alto se ajusta al contenido (sin la barrita ni el tirador de
// resize). Tiene un límite de caracteres razonable y muestra el contador solo
// cuando te vas acercando al tope.
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  maxLength = 700,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minRows?: number
  maxLength?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Recalcula el alto cada vez que cambia el texto (y al montar).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <div className="space-y-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        rows={minRows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${inputClass} resize-none overflow-hidden`}
      />
      {value.length > maxLength * 0.8 && (
        <p className="text-right text-[10px] tabular-nums text-muted-foreground">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  )
}

// ─── ImageUploader — usa blob URL para preview inmediato ──────────────────

export function ImageUploader({
  onUploadReady,
  currentImageUrl,
  blobRegistry,
  aspect = 1,
  compact = false,
  tileClassName,
  heightClass = "h-28",
  placeholderLabel = "Subir imagen",
  optional = false,
}: {
  onUploadReady: (blobUrl: string) => void
  currentImageUrl?: string
  blobRegistry: BlobRegistry
  /** Relación de aspecto del recorte al acomodar la imagen (ancho/alto). */
  aspect?: number
  /** Recuadro pequeño (ej. junto al audio en el editor de pistas). */
  compact?: boolean
  /** Clases para forzar el tamaño/forma del recuadro (gana sobre heightClass). */
  tileClassName?: string
  /** Alto del recuadro cuando no se pasa tileClassName; el ancho sale del aspecto. */
  heightClass?: string
  /** Texto del recuadro vacío. */
  placeholderLabel?: string
  /** Muestra "(opcional)" dentro del recuadro vacío (ej. imagen de pista). */
  optional?: boolean
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Al confirmar un recorte, el modal devuelve el blob URL nuevo junto con su
  // File ya armado — se registra directo, sin el round-trip fetch(blobUrl)
  // que había antes (si ese fetch fallaba, el registro quedaba sin la
  // entrada pero la imagen recortada igual quedaba puesta en el bloque, y
  // publicar tiraba "no se encontró el archivo" para algo recién recortado).
  function handleAdjustConfirm(blobUrl: string, file: File) {
    setAdjusting(false)
    blobRegistry.current.set(blobUrl, file)
    if (localPreview && localPreview.startsWith("blob:")) {
      URL.revokeObjectURL(localPreview)
    }
    setLocalPreview(blobUrl)
    onUploadReady(blobUrl)
  }

  const displayUrl = localPreview || currentImageUrl

  // Un único recuadro presionable: la imagen y el "subir/cambiar" son lo
  // mismo (antes el botón vivía en una barra aparte, ajena a la miniatura).
  //   · Tocar el recuadro  → elige o cambia el archivo.
  //   · Badge "Acomodar"   → abre el editor de encuadre (solo si ya hay imagen).
  // El tamaño lo define tileClassName (si se pasa) o, por defecto, el alto
  // heightClass con el ancho saliendo del aspecto.
  const boxSize = compact ? "size-20" : tileClassName ?? heightClass
  const boxStyle = compact || tileClassName ? undefined : { aspectRatio: String(aspect) }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-label={placeholderLabel}
      />
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg border border-dashed border-input bg-background ${boxSize}`}
        style={boxStyle}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title={displayUrl ? "Cambiar imagen" : placeholderLabel}
          aria-label={displayUrl ? "Cambiar imagen" : placeholderLabel}
          className="flex h-full w-full flex-col items-center justify-center gap-1 hover:bg-accent"
        >
          {displayUrl ? (
            <img src={displayUrl} alt="Vista previa" className="h-full w-full object-cover" />
          ) : (
            <>
              <ImagePlus className={compact ? "size-5 text-muted-foreground" : "size-6 text-muted-foreground"} />
              <span
                className={`px-1 text-center font-medium text-muted-foreground ${compact ? "text-[9px]" : "text-[11px]"}`}
              >
                {placeholderLabel}
              </span>
              {optional && (
                <span className={`text-muted-foreground/60 ${compact ? "text-[8px]" : "text-[10px]"}`}>
                  (opcional)
                </span>
              )}
            </>
          )}
        </button>
        {displayUrl && (
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            title="Acomodar imagen"
            aria-label="Acomodar imagen"
            className="absolute right-1 top-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 text-white transition-colors hover:bg-black/80"
          >
            <Move className="size-3" />
            {!compact && <span className="text-[10px] font-medium leading-none">Acomodar</span>}
          </button>
        )}
      </div>

      {adjusting && displayUrl && (
        <ImageAdjustModal
          src={displayUrl}
          aspect={aspect}
          onCancel={() => setAdjusting(false)}
          onConfirm={handleAdjustConfirm}
        />
      )}
    </>
  )
}

// ─── AudioUploader — blob URL inmediata para pistas ───────────────────────

// Tope generoso sobre el archivo ORIGINAL (antes de comprimir) — un wav de
// varios minutos en alta resolución puede pesar bastante. lib/audio-transcode
// lo comprime a mp3 antes de subirlo a R2, así que este límite es solo para
// evitar que alguien suba un archivo absurdamente grande y trabe el
// navegador transcodificando.
const MAX_AUDIO_FILE_SIZE_MB = 100
const MAX_AUDIO_FILE_SIZE_BYTES = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024

// Extensiones que ya vienen en un contenedor comprimido válido — mismo
// criterio que COMPRESSED_AUDIO_EXTS en lib/audio-transcode, pero acá también
// cuenta "mpeg/mpg/mp2" como candidatas a re-codificar (ver esa lista: se
// excluyeron a propósito para forzar mp3 real), así que el selector de
// calidad SÍ les aplica.
const ALREADY_COMPRESSED_EXTS = new Set(["mp3", "aac", "m4a"])

function AudioUploader({
  onUploadReady,
  currentAudioUrl,
  blobRegistry,
  compact = false,
  previewButton,
  durationLabel,
}: {
  onUploadReady: (blobUrl: string, fileHash: string) => void
  currentAudioUrl?: string
  blobRegistry: BlobRegistry
  /** Recuadro cuadrado con ícono en vez de la barra larga como disparador. */
  compact?: boolean
  /** Botón de reproducir/pausar (lo arma el padre con el motor de audio). En
      modo compacto va debajo del recuadro de audio, junto a la duración. */
  previewButton?: React.ReactNode
  /** Duración del archivo subido (ej. "3:24"), al lado del botón de reproducir. */
  durationLabel?: string
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hashing, setHashing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lastWasAlreadyCompressed, setLastWasAlreadyCompressed] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    // Aceptamos mp3/aac/m4a (ya comprimidos, se suben tal cual) y además
    // cualquier formato de audio sin comprimir habitual entre músicos (wav,
    // flac, aiff, ogg) — lib/audio-transcode los convierte a mp3 en el
    // navegador antes de subir, así que no hace falta pedirle al usuario que
    // exporte en un formato "óptimo para la web": suba lo que tenga.
    // La validación por nombre de archivo sola era demasiado estricta: un
    // nombre con espacios al final, mayúsculas, o sin extensión visible (el
    // navegador a veces la omite al venir de un recorte/exportación) hacía
    // que un archivo válido fuera rechazado. Ahora también se acepta si el
    // navegador reporta un MIME de audio compatible, aunque el nombre no sea claro.
    const rawName = file.name.trim()
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase().trim() : ""
    const ACCEPTED_EXTS = new Set(["mp3", "mpeg", "mpg", "mp2", "aac", "m4a", "wav", "flac", "aiff", "aif", "ogg"])
    const mimeIsAccepted = /mpeg|mp3|aac|mp4|wav|wave|flac|aiff|ogg/i.test(file.type)
    if (!ACCEPTED_EXTS.has(ext ?? "") && !mimeIsAccepted) {
      setError("Formato no reconocido. Subí un archivo de audio (.mp3, .wav, .flac, .aiff, .aac, .ogg).")
      e.target.value = ""
      return
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      setError(`El archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB. El máximo permitido es ${MAX_AUDIO_FILE_SIZE_MB}MB.`)
      e.target.value = ""
      return
    }

    setError(null)
    setLastWasAlreadyCompressed(ALREADY_COMPRESSED_EXTS.has(ext ?? ""))

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

    // La calidad ya no se elige a mano: cada archivo se publica con la
    // calidad con la que se subió — un mp3/aac/m4a se sube tal cual (su
    // bitrate original) y un formato sin comprimir se convierte a mp3 al
    // máximo (DEFAULT_AUDIO_BITRATE) en profile-editor. Por eso ya no se
    // registra nada en audioBitrateByFile acá (el publish cae al default).
    const blobUrl = URL.createObjectURL(file)
    blobRegistry.current.set(blobUrl, file)

    setFileName(file.name)
    onUploadReady(blobUrl, fileHash)
    e.target.value = ""
  }

  const hasAudio = Boolean(fileName || currentAudioUrl)
  const displayName = fileName || (currentAudioUrl ? "Audio cargado ✓" : null)

  const ACCEPT_ATTR =
    ".mp3,.aac,.m4a,.wav,.flac,.aiff,.aif,.ogg,audio/mpeg,audio/aac,audio/mp4,audio/wav,audio/x-wav,audio/flac,audio/aiff,audio/ogg"

  // Progreso del hash y errores — van debajo del disparador en ambos modos.
  const statusExtras = (
    <>
      {hashing && <p className="text-[11px] text-muted-foreground">Calculando huella digital SHA-256...</p>}
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </>
  )

  // Nombre del archivo (chip) — en modo NO compacto va arriba, como antes.
  const statusBlock = (
    <>
      {displayName && (
        <p className="flex items-center gap-1.5 truncate rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          <Music className="size-3 shrink-0" />
          <span className="truncate">{displayName}</span>
        </p>
      )}
      {statusExtras}
    </>
  )

  // Notas al pie — van después del disparador (recuadro o barra) en ambos modos.
  const notesBlock = (
    <>
      {lastWasAlreadyCompressed && fileName && (
        <p className="text-[11px] text-muted-foreground">
          Este archivo ya viene comprimido — se sube tal cual, con su calidad original.
        </p>
      )}
      {!hasAudio && (
        <p className="text-[11px] text-muted-foreground">
          Si subís un formato sin comprimir (wav, flac, aiff), se convierte automáticamente a mp3 al publicar.
        </p>
      )}
    </>
  )

  if (compact) {
    return (
      <div className="min-w-0 flex-1 space-y-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          className="hidden"
          aria-label="Subir audio"
        />
        {/* Columna a la derecha de la imagen, del mismo alto (size-20 = h-20):
            arriba el recuadro para subir/cambiar el audio, abajo el botón de
            reproducir junto a la duración del archivo. */}
        <div className="flex h-20 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={hasAudio ? "Cambiar audio" : "Subir audio"}
            aria-label={hasAudio ? "Cambiar audio" : "Subir audio"}
            className={`flex flex-1 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-background px-1 hover:bg-accent ${
              hasAudio ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Music className="size-5" />
            <span className="text-center text-[10px] font-medium leading-tight">
              {hasAudio ? "Cambiar audio" : "Subir audio"}
            </span>
          </button>
          {/* Reproducir · nombre del audio · duración — en esa fila, el nombre
              entre el botón y el tiempo (no debajo). */}
          <div className="flex h-8 shrink-0 items-center gap-2">
            {previewButton}
            {hasAudio ? (
              <>
                {/* Nombre del audio centrado entre el botón y la duración. */}
                {displayName && (
                  <span
                    title={displayName}
                    className="min-w-0 flex-1 truncate px-1 text-center text-[11px] font-medium text-primary"
                  >
                    {displayName}
                  </span>
                )}
                {durationLabel && (
                  <span
                    title="Calculado automáticamente al subir el audio"
                    aria-label={`Duración: ${durationLabel}`}
                    className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground"
                  >
                    {durationLabel}
                  </span>
                )}
              </>
            ) : (
              <span className="ml-auto text-[10px] text-muted-foreground/70">Sin audio</span>
            )}
          </div>
        </div>
        {statusExtras}
        {notesBlock}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {statusBlock}

      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors ${
          hasAudio
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-input bg-background text-foreground hover:bg-accent"
        }`}
      >
        <Music className="size-3.5 text-muted-foreground" />
        <span>Subir audio (mp3, wav, flac, aiff, aac, ogg)</span>
        <input type="file" accept={ACCEPT_ATTR} onChange={handleFileChange} className="hidden" />
      </label>
      {notesBlock}
    </div>
  )
}

// ─── HeroFields ───────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = (
  Object.entries(SOCIAL_PLATFORM_LABELS) as [SocialPlatform, string][]
).map(([value, label]) => ({ value, label }))

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
    <div className="space-y-2 border-t border-sidebar-border pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
      <ItemPager
        label="Red"
        count={socials.length}
        onAdd={addSocial}
        onRemove={removeSocial}
        addLabel="Agregar enlace"
        emptyLabel="Añade tu primera red social."
        hideRemove
      >
        {(index) => {
          const social = socials[index]
          if (!social) return null
          return (
            <>
              {/* Selector de red + tacho rojo pequeño para quitarla (antes el
                  borrado era un botón grande y largo al pie). */}
              <div className="flex items-center gap-2">
                <select
                  value={social.platform}
                  onChange={(e) => setSocial(index, { platform: e.target.value as SocialPlatform })}
                  className={`${inputClass} min-w-0 flex-1`}
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
                  aria-label="Eliminar red social"
                  title="Eliminar red social"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/15"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <TextInput
                value={social.href}
                onChange={(e) => setSocial(index, { href: e.target.value })}
                placeholder="https://..."
              />
            </>
          )
        }}
      </ItemPager>
    </div>
  )
}

const ROLE_TAG_SEPARATOR = " · "

function RoleTagPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedLabels = value
    .split(ROLE_TAG_SEPARATOR)
    .map((label) => label.trim())
    .filter(Boolean)

  const knownLabels = MUSICIAN_ROLES.map((r) => r.label)
  // Texto viejo (ej. taglines escritas a mano antes de este picker) que no
  // coincide con ningún rol conocido — los botones de abajo no pueden
  // quitarlo porque solo hacen toggle de labels exactos, así que se muestra
  // aparte con su propia "x" para poder limpiarlo.
  const strayLabels = selectedLabels.filter((l) => !knownLabels.includes(l))

  const toggleRole = (label: string) => {
    const next = selectedLabels.includes(label)
      ? selectedLabels.filter((l) => l !== label)
      : [...selectedLabels, label]
    onChange(next.join(ROLE_TAG_SEPARATOR))
  }

  const removeStray = (label: string) => {
    onChange(selectedLabels.filter((l) => l !== label).join(ROLE_TAG_SEPARATOR))
  }

  return (
    <div className="space-y-2">
      {strayLabels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {strayLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => removeStray(label)}
              title="Quitar este texto"
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive"
            >
              {label}
              <X className="size-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(selectedLabels.filter((l) => knownLabels.includes(l)).join(ROLE_TAG_SEPARATOR))}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Borrar todo el texto anterior
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {MUSICIAN_ROLES.map((role) => {
          const active = selectedLabels.includes(role.label)
          return (
            <button
              key={role.id}
              type="button"
              title={role.description}
              onClick={() => toggleRole(role.label)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {role.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Campo del botón de contacto: solo admite un WhatsApp (número con código de
// país), un Telegram (@usuario) o un correo — nada de links sueltos. Valida el
// formato en vivo y avisa si no calza. La verificación REAL de que el dato es
// tuyo (enviar un código por SMS/correo) necesita un servicio conectado; ver
// la nota de abajo.
function ContactField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const trimmed = value.trim()
  const resolved = trimmed ? resolveContactChannel(trimmed) : null
  // "other" = un link cualquiera u algo no reconocido → no se acepta.
  const isValid = resolved !== null && resolved.channel !== "other"
  const DetectedIcon = isValid && resolved ? CONTACT_CHANNEL_ICONS[resolved.channel] : null

  return (
    <>
      <div className="relative">
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. +51 987654321, @tuusuario o tu@correo.com"
          aria-invalid={trimmed.length > 0 && !isValid}
        />
        {trimmed.length > 0 && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {isValid ? (
              <Check className="size-4 text-emerald-500" />
            ) : (
              <AlertCircle className="size-4 text-destructive" />
            )}
          </span>
        )}
      </div>

      {trimmed.length > 0 && isValid && resolved && DetectedIcon && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
          <DetectedIcon className="size-3.5" />
          Se abrirá por {CONTACT_CHANNEL_LABELS[resolved.channel]}.
        </p>
      )}
      {trimmed.length > 0 && !isValid && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          Escribe un número de WhatsApp con código de país (ej. +51 987654321), un usuario de Telegram (@usuario)
          o un correo válido — no se admiten enlaces sueltos.
        </p>
      )}

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Un número muestra el ícono de WhatsApp, un usuario con "@" el de Telegram, y un correo el de Mail — el
        botón en tu perfil se ve como un ícono, sin texto.
      </p>
      <p className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        Asegúrate de que sea tuyo y esté activo: tus fans te escribirán ahí directamente.
      </p>
    </>
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
      <Field label="Nombre real (opcional)">
        <TextInput
          value={data.realName || ""}
          onChange={(e) => onChange({ ...data, realName: e.target.value })}
          placeholder="Ej. Juan Pérez"
        />
      </Field>
      {/* Foto de perfil (cuadrada) + banner (rectangular) uno al lado del otro:
          cada recuadro es la propia imagen, presionable para subir/cambiar. */}
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">Foto de perfil</span>
          <ImageUploader
            currentImageUrl={data.image}
            onUploadReady={(url) => onChange({ ...data, image: url })}
            blobRegistry={blobRegistry}
            aspect={1}
            tileClassName="size-20"
            placeholderLabel="Subir foto"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">Banner de fondo</span>
          <ImageUploader
            currentImageUrl={data.banner}
            onUploadReady={(url) => onChange({ ...data, banner: url })}
            blobRegistry={blobRegistry}
            aspect={16 / 9}
            tileClassName="h-20 w-full"
            placeholderLabel="Subir banner"
          />
        </div>
      </div>
      <Field label="¿Qué eres?">
        <RoleTagPicker
          value={data.tagline || ""}
          onChange={(tagline) => onChange({ ...data, tagline })}
        />
      </Field>
      <Field label="Ubicación">
        <LocationSelect
          value={data.location || ""}
          onChange={(location) => onChange({ ...data, location })}
        />
      </Field>
      <SocialLinksFields
        socials={data.socials || []}
        onChange={(socials) => onChange({ ...data, socials })}
      />
      <Field label="Botón de contacto (opcional)">
        <ContactField
          value={data.contactUrl || ""}
          onChange={(contactUrl) => onChange({ ...data, contactUrl })}
        />
      </Field>
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

/**
 * Duración de un audio recién subido (blob URL). Si el File real todavía
 * está en blobRegistry, se mide con ffmpeg (exacto — ver
 * lib/audio-transcode: <audio>.duration en el navegador puede errar por
 * varios segundos en mp3 con bitrate variable). Si no está disponible, cae
 * al método del navegador sobre la blob URL como antes.
 */
async function resolveUploadedDuration(url: string, blobRegistry: BlobRegistry): Promise<number> {
  const file = blobRegistry.current.get(url)
  if (file) {
    const { getAccurateAudioDuration } = await import("@/lib/audio-transcode")
    const accurate = await getAccurateAudioDuration(file)
    if (accurate !== null) return accurate
  }
  return extractAudioDuration(url)
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
  // La preescucha usa el motor de audio global (un solo <audio> para toda la
  // app), así nunca choca con otra preescucha ni con el perfil.
  const [engine, setEngine] = useState<audioEngine.AudioEngineState>(audioEngine.getState)
  useEffect(() => audioEngine.subscribe(setEngine), [])
  const isPreviewing = Boolean(data.audioUrl) && engine.url === data.audioUrl && engine.playing

  const handleAudioUploaded = async (url: string) => {
    // Igual que en TracksFields: audioUrl y duration se guardan juntos en una
    // sola actualización para no pisar el estado con una copia vieja.
    let duration = ""
    try {
      duration = formatDuration(await resolveUploadedDuration(url, blobRegistry))
    } catch {
      // Sin metadata legible: se deja vacío, el artista puede escribirla luego.
    }
    onChange({ ...data, audioUrl: url, duration })
  }

  const togglePreview = () => {
    if (data.audioUrl) audioEngine.toggle(data.audioUrl)
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
        <div className="min-w-0 flex-1">
          <Field label="Género">
            <GenreSelect
              value={data.genre || ""}
              onChange={(genre) => onChange({ ...data, genre })}
            />
          </Field>
        </div>
        <div className="w-24 shrink-0">
          <Field label="Año">
            <YearSelect value={data.year || ""} onChange={(year) => onChange({ ...data, year })} />
          </Field>
        </div>
      </div>
      {/* Portada (cuadrada, presionable) a la izquierda; a su derecha el
          recuadro de audio + reproducir/duración, todo del mismo alto. */}
      <Field label="Portada y audio">
        <div className="flex items-start gap-2">
          <ImageUploader
            compact
            optional
            currentImageUrl={data.cover}
            onUploadReady={(url) => onChange({ ...data, cover: url })}
            blobRegistry={blobRegistry}
          />
          <AudioUploader
            compact
            currentAudioUrl={data.audioUrl}
            onUploadReady={(url) => handleAudioUploaded(url)}
            blobRegistry={blobRegistry}
            previewButton={
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
            }
            durationLabel={data.duration}
          />
        </div>
      </Field>
      <Field label="Descripción (opcional)">
        <AutoGrowTextarea
          value={data.description || ""}
          onChange={(v) => onChange({ ...data, description: v })}
          minRows={3}
          maxLength={800}
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
  focusAlbumId,
}: {
  data: TracksData
  onChange: (d: TracksData) => void
  blobRegistry: BlobRegistry
  // Id de álbum recién elegido en el lienzo (ver profile-editor.tsx) — al
  // cambiar, este panel salta a ese mismo álbum en vez de quedarse en el
  // que ya tenía abierto.
  focusAlbumId?: string | null
}) {
  const albums = data.albums || []
  // Preescucha vía motor de audio global — una sola pista suena a la vez.
  const [engine, setEngine] = useState<audioEngine.AudioEngineState>(audioEngine.getState)
  useEffect(() => audioEngine.subscribe(setEngine), [])
  // Solo un álbum se edita a la vez — evita el scroll largo de mostrarlos todos juntos.
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(albums[0]?.id ?? null)

  useEffect(() => {
    if (focusAlbumId && albums.some((a) => a.id === focusAlbumId)) {
      setActiveAlbumId(focusAlbumId)
    }
    // Solo debe reaccionar cuando cambia el álbum enfocado desde el lienzo,
    // no cada vez que `albums` se actualiza por una edición cualquiera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAlbumId])

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
      duration = formatDuration(await resolveUploadedDuration(url, blobRegistry))
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

  const togglePreview = (url?: string) => {
    if (url) audioEngine.toggle(url)
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
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Género">
                  <GenreSelect
                    value={activeAlbum.genre || ""}
                    onChange={(genre) => setAlbum(activeAlbumIndex, { genre })}
                  />
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <Field label="Año">
                  <YearSelect
                    value={activeAlbum.year || ""}
                    onChange={(year) => setAlbum(activeAlbumIndex, { year })}
                  />
                </Field>
              </div>
            </div>
            {/* Portada (cuadrada, presionable) a la izquierda; a su costado la
                descripción del álbum con 3 bolitas para cambiar entre los 3
                textos (opcionales) sin apilarlos todos. */}
            <AlbumCoverAndDescription
              album={activeAlbum}
              blobRegistry={blobRegistry}
              onCoverChange={(url) => setAlbum(activeAlbumIndex, { cover: url })}
              onDescriptionsChange={(descriptions) => setAlbum(activeAlbumIndex, { descriptions })}
            />

            <div className="border-t border-sidebar-border pt-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pistas</p>
              <ItemPager
                label="Pista"
                count={activeAlbum.tracks.length}
                onAdd={() => addTrack(activeAlbumIndex)}
                onRemove={(trackIndex) => removeTrack(activeAlbumIndex, trackIndex)}
                addLabel="Agregar Pista"
                emptyLabel="Este álbum no tiene pistas todavía."
              >
                {(trackIndex) => {
                  const track = activeAlbum.tracks[trackIndex]
                  if (!track) return null
                  const isPreviewing = Boolean(track.audioUrl) && engine.url === track.audioUrl && engine.playing
                  const previewButton = (
                    <button
                      type="button"
                      onClick={() => togglePreview(track.audioUrl)}
                      disabled={!track.audioUrl}
                      title={track.audioUrl ? "Escuchar antes de publicar" : "Sube un audio para poder escucharlo"}
                      aria-label={isPreviewing ? "Pausar preescucha" : "Escuchar antes de publicar"}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-input disabled:bg-transparent disabled:text-muted-foreground/40 disabled:opacity-60"
                    >
                      {isPreviewing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                  )
                  return (
                    <>
                      <input
                        type="text"
                        value={track.title || ""}
                        onChange={(e) => setTrack(activeAlbumIndex, trackIndex, "title", e.target.value)}
                        className={`${inputClass} w-full`}
                        placeholder="Nombre de la canción"
                        aria-label="Nombre de la canción"
                      />
                      {/* Imagen (cuadrada, presionable) a la izquierda; a su
                          derecha el recuadro de audio + reproducir/duración,
                          todo del mismo alto para que vaya a la par. */}
                      <div className="flex items-start gap-2">
                        <ImageUploader
                          compact
                          optional
                          currentImageUrl={track.image}
                          onUploadReady={(url) => setTrack(activeAlbumIndex, trackIndex, "image", url)}
                          blobRegistry={blobRegistry}
                        />
                        <AudioUploader
                          compact
                          currentAudioUrl={track.audioUrl}
                          onUploadReady={(url, hash) => handleAudioUploaded(activeAlbumIndex, trackIndex, url, hash)}
                          blobRegistry={blobRegistry}
                          previewButton={previewButton}
                          durationLabel={track.duration}
                        />
                      </div>
                      <AutoGrowTextarea
                        value={track.description || ""}
                        onChange={(v) => setTrack(activeAlbumIndex, trackIndex, "description", v)}
                        minRows={2}
                        maxLength={600}
                        placeholder="Descripción (opcional): en qué te inspiraste, qué significa esta canción..."
                      />
                    </>
                  )
                }}
              </ItemPager>
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

const ALBUM_DESCRIPTION_PLACEHOLDERS = [
  "Ej. concepto del álbum: de qué trata en conjunto, qué historia cuenta de principio a fin...",
  "Ej. proceso de creación: dónde y cómo se grabó, con quién se hizo, cuánto tardó...",
  "Ej. a quién va dirigido o qué querés que sienta quien lo escuche completo...",
]

// Portada del álbum + su descripción, lado a lado. La descripción es opcional
// y admite hasta 3 textos que en el perfil rotan en carrusel; acá no se
// apilan los 3 recuadros: hay 3 bolitas arriba y cada una abre uno distinto,
// para quien quiera escribir más de uno.
function AlbumCoverAndDescription({
  album,
  blobRegistry,
  onCoverChange,
  onDescriptionsChange,
}: {
  album: Album
  blobRegistry: BlobRegistry
  onCoverChange: (url: string) => void
  onDescriptionsChange: (descriptions: string[]) => void
}) {
  const [descIndex, setDescIndex] = useState(0)
  const descriptions = album.descriptions || ["", "", ""]

  const setActiveDescription = (value: string) => {
    const next = [...descriptions]
    while (next.length < 3) next.push("")
    next[descIndex] = value
    onDescriptionsChange(next)
  }

  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Portada</span>
        <ImageUploader
          currentImageUrl={album.cover}
          onUploadReady={onCoverChange}
          blobRegistry={blobRegistry}
          aspect={1}
          tileClassName="size-24"
          placeholderLabel="Portada"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="block text-xs font-medium text-muted-foreground">Descripción del álbum</span>
          {/* Bolitas: cada una es uno de los 3 textos. La activa se resalta;
              las que ya tienen contenido se ven llenas. */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => {
              const filled = Boolean((descriptions[i] || "").trim())
              const active = i === descIndex
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDescIndex(i)}
                  aria-label={`Descripción ${i + 1}`}
                  title={`Descripción ${i + 1}${filled ? " (con texto)" : " (vacía)"}`}
                  className={`size-2.5 rounded-full transition-all ${
                    active
                      ? "scale-110 bg-primary ring-2 ring-primary/30"
                      : filled
                        ? "bg-primary/50 hover:bg-primary/70"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              )
            })}
          </div>
        </div>
        <AutoGrowTextarea
          value={descriptions[descIndex] || ""}
          onChange={(v) => setActiveDescription(v)}
          minRows={3}
          maxLength={700}
          placeholder={ALBUM_DESCRIPTION_PLACEHOLDERS[descIndex]}
        />
      </div>
    </div>
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

const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  pending: "Pendiente de aprobación",
  accepted: "Aceptado",
  rejected: "Rechazado",
}

const CREDIT_STATUS_CLASSES: Record<CreditStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
}

function CreditsFields({
  data,
  onChange,
  profileId,
  blobRegistry,
}: {
  data: CreditsData
  onChange: (d: CreditsData) => void
  profileId: string | null
  blobRegistry: BlobRegistry
}) {
  const credits = data.credits || []

  const updateCredits = (next: CreditItem[]) => onChange({ credits: next })

  const addCredit = () => {
    const newItem: CreditItem = {
      id: `credit-${Date.now()}`,
      sourceType: "external",
      title: "",
      mainArtist: "",
      role: "M",
      externalUrl: "",
      status: "accepted",
    }
    updateCredits([...credits, newItem])
  }

  const setCredit = (index: number, changes: Partial<CreditItem>) => {
    updateCredits(credits.map((c, i) => (i === index ? { ...c, ...changes } : c)))
  }

  const removeCredit = (index: number) => {
    updateCredits(credits.filter((_, i) => i !== index))
  }

  // Al cambiar el tipo de origen se limpian los campos específicos del otro
  // tipo — así nunca queda un enlace de YouTube colgando en un crédito
  // interno, ni una referencia de canción/solicitud en uno externo.
  const setSourceType = (index: number, sourceType: CreditSourceType) => {
    if (sourceType === "internal") {
      setCredit(index, {
        sourceType,
        title: "",
        mainArtist: "",
        externalUrl: undefined,
        status: "pending",
        requestId: undefined,
        ownerProfileId: undefined,
        songKey: undefined,
      })
    } else {
      setCredit(index, {
        sourceType,
        title: "",
        mainArtist: "",
        externalUrl: "",
        status: "accepted",
        requestId: undefined,
        ownerProfileId: undefined,
        songKey: undefined,
      })
    }
  }

  const handleSongSelect = async (index: number, credit: CreditItem, song: PlatformSongResult) => {
    if (!profileId) return
    const { id: requestId, status } = await createCreditRequest({
      requesterProfileId: profileId,
      requesterCreditId: credit.id,
      ownerProfileId: song.ownerProfileId,
      songTitle: song.title,
      songKey: song.songKey,
      role: credit.role,
    })
    setCredit(index, {
      title: song.title,
      mainArtist: song.ownerDisplayName,
      ownerProfileId: song.ownerProfileId,
      songKey: song.songKey,
      requestId,
      status,
    })
  }

  const refreshStatus = async (index: number, credit: CreditItem) => {
    if (!credit.requestId) return
    const statuses = await fetchCreditRequestStatuses([credit.requestId])
    const next = statuses[credit.requestId]
    if (next) setCredit(index, { status: next })
  }

  return (
    <ItemPager
      label="Crédito"
      count={credits.length}
      onAdd={addCredit}
      onRemove={removeCredit}
      addLabel="Agregar Crédito"
      emptyLabel="Añade tu primer crédito para empezar."
    >
      {(index) => {
        const credit = credits[index]
        if (!credit) return null
        return (
          <>
            <Field label="Imagen de la tarjeta">
              <ImageUploader
                currentImageUrl={credit.image}
                onUploadReady={(blobUrl) => setCredit(index, { image: blobUrl })}
                blobRegistry={blobRegistry}
              />
            </Field>

            <Field label="Tipo de origen">
              <select
                value={credit.sourceType}
                onChange={(e) => setSourceType(index, e.target.value as CreditSourceType)}
                className={inputClass}
              >
                <option value="internal">Colaboración con artista de la plataforma</option>
                <option value="external">Crédito Externo (enlace)</option>
              </select>
            </Field>

            {credit.sourceType === "internal" ? (
              <InternalCreditFields
                credit={credit}
                profileId={profileId}
                onSelectSong={(song) => handleSongSelect(index, credit, song)}
                onRefreshStatus={() => refreshStatus(index, credit)}
              />
            ) : (
              <ExternalCreditFields credit={credit} onFieldChange={(changes) => setCredit(index, changes)} />
            )}

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
          </>
        )
      }}
    </ItemPager>
  )
}

// Opción A del Bloque 4: busca una canción ya publicada por OTRO artista de
// la plataforma. Al seleccionarla se crea la solicitud de crédito
// ("pending") y el título/artista quedan fijos — solo se pueden volver a
// tocar buscando y eligiendo otra canción.
function InternalCreditFields({
  credit,
  profileId,
  onSelectSong,
  onRefreshStatus,
}: {
  credit: CreditItem
  profileId: string | null
  onSelectSong: (song: PlatformSongResult) => Promise<void>
  onRefreshStatus: () => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlatformSongResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const handle = setTimeout(() => {
      searchPlatformSongs(query, profileId ?? undefined)
        .then((found) => {
          if (!cancelled) setResults(found)
        })
        .catch((err) => {
          console.error("Error buscando canciones en la plataforma:", err)
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, profileId])

  // Ya hay una canción de plataforma elegida — se muestra su estado en vez
  // del buscador.
  if (credit.songKey && credit.title) {
    return (
      <div className="space-y-2 rounded-lg border border-sidebar-border bg-sidebar/40 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{credit.title}</p>
            <p className="truncate text-xs text-muted-foreground">{credit.mainArtist}</p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CREDIT_STATUS_CLASSES[credit.status]}`}
          >
            {CREDIT_STATUS_LABELS[credit.status]}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {credit.status === "pending" &&
            "Este crédito se mostrará en tu perfil cuando el artista dueño de la canción lo acepte desde su panel de notificaciones."}
          {credit.status === "rejected" && "El artista dueño de la canción rechazó este crédito — no se mostrará en tu perfil."}
          {credit.status === "accepted" && "Aceptado — este crédito ya está visible en tu perfil público."}
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            try {
              await onRefreshStatus()
            } catch (err) {
              console.error("No se pudo actualizar el estado del crédito:", err)
            } finally {
              setRefreshing(false)
            }
          }}
          className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
        >
          {refreshing ? "Actualizando..." : "Actualizar estado"}
        </button>
      </div>
    )
  }

  return (
    <Field label="Buscar canción en la plataforma">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe el nombre de la canción..."
          className={`${inputClass} pl-8`}
        />
      </div>
      {searching && <p className="mt-1 text-[11px] text-muted-foreground">Buscando...</p>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">Sin resultados.</p>
      )}
      {errorMessage && <p className="mt-1 text-[11px] text-destructive">{errorMessage}</p>}
      {results.length > 0 && (
        <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-sidebar-border bg-background/60 p-1">
          {results.map((song) => (
            <button
              key={song.songKey}
              type="button"
              disabled={selecting}
              onClick={async () => {
                setSelecting(true)
                setErrorMessage("")
                try {
                  await onSelectSong(song)
                  setQuery("")
                  setResults([])
                } catch (err) {
                  console.error("No se pudo crear la solicitud de crédito:", err)
                  setErrorMessage("No se pudo enviar la solicitud. Intenta de nuevo.")
                } finally {
                  setSelecting(false)
                }
              }}
              className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
            >
              <span className="truncate text-xs font-medium text-foreground">{song.title}</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {song.ownerDisplayName}
                {song.albumTitle ? ` — ${song.albumTitle}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}

const OEMBED_PLATFORM_LABELS: Record<OembedProvider, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
}

// Opción B del Bloque 4: pide un enlace externo (YouTube, Spotify,
// SoundCloud, TikTok, Facebook o Instagram) — al perder el foco se consulta
// /api/oembed para autocompletar título, artista e imagen. Facebook e
// Instagram sin token de app de Meta no traen metadata (fallback), pero el
// reproductor igual funciona — nunca bloquea el flujo, el usuario siempre
// puede completar/retocar los campos a mano.
function ExternalCreditFields({
  credit,
  onFieldChange,
}: {
  credit: CreditItem
  onFieldChange: (changes: Partial<CreditItem>) => void
}) {
  const [fetching, setFetching] = useState(false)
  const [notice, setNotice] = useState<{ type: "error" | "info"; message: string } | null>(null)

  const handleUrlBlur = async () => {
    const url = credit.externalUrl?.trim()
    if (!url) return

    const provider = detectOembedProvider(url)
    if (!provider) {
      setNotice({
        type: "error",
        message: "Este enlace no es de una plataforma compatible (YouTube, Spotify, SoundCloud, TikTok, Facebook o Instagram).",
      })
      return
    }

    setFetching(true)
    setNotice(null)
    try {
      const meta = await fetchOembedMetadata(url)
      if (!meta) {
        setNotice({ type: "error", message: "No se pudo leer el enlace — completa los datos manualmente." })
        return
      }
      onFieldChange({
        title: credit.title || meta.title || credit.title,
        mainArtist: credit.mainArtist || meta.authorName || credit.mainArtist,
        image: credit.image || meta.thumbnailUrl || credit.image,
      })
      if (meta.fallback) {
        setNotice({
          type: "info",
          message: `${OEMBED_PLATFORM_LABELS[provider]} no dejó autocompletar título y artista para este enlace — complétalos manualmente. El reproductor funcionará igual.`,
        })
      }
    } catch (err) {
      console.error("No se pudo leer la información del enlace:", err)
      setNotice({ type: "error", message: "No se pudo leer el enlace — completa los datos manualmente." })
    } finally {
      setFetching(false)
    }
  }

  return (
    <>
      <Field label="Enlace externo (YouTube, Spotify, SoundCloud, TikTok, Facebook o Instagram)">
        <TextInput
          value={credit.externalUrl || ""}
          onChange={(e) => onFieldChange({ externalUrl: e.target.value })}
          onBlur={handleUrlBlur}
          placeholder="https://..."
        />
        {fetching && <p className="mt-1 text-[11px] text-muted-foreground">Obteniendo datos del enlace...</p>}
        {notice && (
          <p className={`mt-1 text-[11px] ${notice.type === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {notice.message}
          </p>
        )}
      </Field>

      <Field label="Título de la canción">
        <TextInput
          value={credit.title}
          onChange={(e) => onFieldChange({ title: e.target.value })}
          placeholder="Se completa solo al pegar el enlace"
        />
      </Field>

      <Field label="Artista principal">
        <TextInput
          value={credit.mainArtist}
          onChange={(e) => onFieldChange({ mainArtist: e.target.value })}
          placeholder="Se completa solo al pegar el enlace"
        />
      </Field>
    </>
  )
}

// ─── MultiImageUploader — hasta N fotos, blob URL para preview inmediato ──

function MultiImageUploader({
  images,
  onChange,
  blobRegistry,
  max = 5,
}: {
  images: string[]
  onChange: (images: string[]) => void
  blobRegistry: BlobRegistry
  max?: number
}) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const blobUrl = URL.createObjectURL(file)
    blobRegistry.current.set(blobUrl, file)
    onChange([...images, blobUrl].slice(0, max))
    e.target.value = ""
  }

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url, i) => (
        <div key={`${url}-${i}`} className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-sidebar-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(images.filter((_, idx) => idx !== i))}
            title="Quitar foto"
            aria-label="Quitar foto"
            className="absolute inset-0 hidden items-center justify-center bg-black/60 text-white group-hover:flex"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      {images.length < max && (
        <label className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <ImagePlus className="size-4" />
          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </label>
      )}
    </div>
  )
}

// ─── VariantAdder — arma un grupo de variante (ej. "Talla": S, M, L) ──────

function VariantAdder({ onAdd }: { onAdd: (variant: ProductVariantGroup) => void }) {
  const [name, setName] = useState("")
  const [options, setOptions] = useState("")

  const submit = () => {
    const trimmedName = name.trim()
    const parsedOptions = options.split(",").map((o) => o.trim()).filter(Boolean)
    if (!trimmedName || parsedOptions.length === 0) return
    onAdd({ name: trimmedName, options: parsedOptions })
    setName("")
    setOptions("")
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
        placeholder="Nombre, ej. Talla"
      />
      <input
        type="text"
        value={options}
        onChange={(e) => setOptions(e.target.value)}
        className={inputClass}
        placeholder="Opciones separadas por coma, ej. S, M, L, XL"
      />
      <button
        type="button"
        onClick={submit}
        className="flex shrink-0 items-center justify-center rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

// ─── FeatureAdder — agrega un ítem de "qué incluye" a un servicio ─────────

function FeatureAdder({ onAdd }: { onAdd: (feature: string) => void }) {
  const [value, setValue] = useState("")

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue("")
  }

  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            submit()
          }
        }}
        className={inputClass}
        placeholder="Ej. Archivo WAV master + versión para redes"
      />
      <button
        type="button"
        onClick={submit}
        className="flex shrink-0 items-center justify-center rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
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
      <a
        href="/perfil/admin-merch"
        className="block rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-snug text-primary transition-colors hover:bg-primary/10"
      >
        Todas las opciones de tu tienda también viven acá abajo — esta es solo una vía más
        rápida para ver el <strong>listado completo y el stock →</strong>
      </a>
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
          <div key={product.id} className="space-y-2.5 rounded-lg border border-sidebar-border p-3 bg-background/50">
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
            <div className="grid grid-cols-2 gap-2">
              <Field label="Categoría">
                <select
                  value={product.category || "otro"}
                  onChange={(e) => setProduct(i, { category: e.target.value })}
                  className={inputClass}
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <div className="flex gap-1 rounded-lg border border-input bg-background p-0.5">
                  {(["fisico", "digital"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setProduct(i, { kind })}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                        product.kind === kind
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {kind === "fisico" ? "Físico" : "Digital"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Descripción">
              <textarea
                value={product.description || ""}
                onChange={(e) => setProduct(i, { description: e.target.value })}
                rows={2}
                className={inputClass}
                placeholder="Materiales, qué incluye, formato de descarga..."
              />
            </Field>
            <Field label="Fotos (hasta 5)">
              <MultiImageUploader
                images={product.images ?? []}
                onChange={(images) => setProduct(i, { images, imageUrl: images[0] })}
                blobRegistry={blobRegistry}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Precio">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={product.price || ""}
                  onChange={(e) => setProduct(i, { price: e.target.value })}
                  className={inputClass}
                  placeholder="89.90"
                  aria-label={`Precio de ${product.name || `producto ${i + 1}`}`}
                />
              </Field>
              <Field label="Moneda">
                <select
                  value={product.currency || "USD"}
                  onChange={(e) => setProduct(i, { currency: e.target.value })}
                  className={inputClass}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              {product.kind !== "digital" && (
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
              )}
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Variantes (tallas, colores, formatos...)
              </span>
              {(product.variants ?? []).map((v, vi) => (
                <div
                  key={`${v.name}-${vi}`}
                  className="flex items-center justify-between rounded-lg border border-sidebar-border bg-background/50 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="text-foreground">
                    <strong>{v.name}:</strong> {v.options.join(", ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProduct(i, { variants: product.variants.filter((_, idx) => idx !== vi) })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <VariantAdder onAdd={(variant) => setProduct(i, { variants: [...(product.variants ?? []), variant] })} />
            </div>
            <Field label="Enlace de compra (checkout externo, opcional)">
              <TextInput
                value={product.purchaseUrl || ""}
                onChange={(e) => setProduct(i, { purchaseUrl: e.target.value })}
                placeholder="https://tu-tienda.com/producto — o déjalo vacío para 'Consultar'"
              />
            </Field>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={product.isActive}
                  onChange={(e) => setProduct(i, { isActive: e.target.checked })}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Visible en la tienda
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={product.isFeatured}
                  onChange={(e) => setProduct(i, { isFeatured: e.target.checked })}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Destacado
              </label>
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
  blobRegistry,
}: {
  data: ServiceData
  onChange: (d: ServiceData) => void
  services: CatalogService[]
  onServicesChange: (services: CatalogService[]) => void
  blobRegistry: BlobRegistry
}) {
  const setService = (i: number, changes: Partial<CatalogService>) => {
    onServicesChange(services.map((s, idx) => (idx === i ? { ...s, ...changes } : s)))
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
      <a
        href="/perfil/admin-servicios"
        className="block rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-snug text-primary transition-colors hover:bg-primary/10"
      >
        Todas las opciones de tus servicios también viven acá abajo — esta es solo una vía más
        rápida para ver el <strong>listado completo →</strong>
      </a>
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
          <div key={service.id} className="space-y-2.5 rounded-lg border border-sidebar-border p-3 bg-background/50">
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
            <Field label="Nombre del servicio">
              <TextInput
                value={service.title || ""}
                onChange={(e) => setService(i, { title: e.target.value })}
                placeholder="Ej. Clases de guitarra / Mezcla profesional"
              />
            </Field>
            <Field label="Categoría">
              <select
                value={service.category || "otro"}
                onChange={(e) => setService(i, { category: e.target.value })}
                className={inputClass}
              >
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <textarea
                value={service.description || ""}
                onChange={(e) => setService(i, { description: e.target.value })}
                rows={2}
                className={inputClass}
                placeholder="Qué ofreces exactamente, para quién es, cómo se trabaja..."
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Precio">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={service.price || ""}
                  onChange={(e) => setService(i, { price: e.target.value })}
                  className={inputClass}
                  placeholder="150.00"
                  aria-label={`Precio de ${service.title || `servicio ${i + 1}`}`}
                />
              </Field>
              <Field label="Moneda">
                <select
                  value={service.currency || "USD"}
                  onChange={(e) => setService(i, { currency: e.target.value })}
                  className={inputClass}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cobras...">
                <select
                  value={service.priceUnit || "proyecto"}
                  onChange={(e) => setService(i, { priceUnit: e.target.value })}
                  className={inputClass}
                >
                  {PRICE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Modalidad">
              <div className="flex gap-1 rounded-lg border border-input bg-background p-0.5">
                {(["presencial", "online", "ambas"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setService(i, { modality: m })}
                    className={`flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium capitalize transition-colors ${
                      service.modality === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "presencial" ? "Presencial" : m === "online" ? "Online" : "Ambas"}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex gap-2">
              <Field label="Duración (opcional)">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={service.duration || ""}
                  onChange={(e) => setService(i, { duration: e.target.value })}
                  className={inputClass}
                  placeholder="60"
                  aria-label={`Duración de ${service.title || `servicio ${i + 1}`}`}
                />
              </Field>
              <Field label="Unidad">
                <select
                  value={service.durationUnit || "min"}
                  onChange={(e) => setService(i, { durationUnit: e.target.value })}
                  className={inputClass}
                  aria-label="Unidad de duración"
                >
                  {DURATION_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            {serviceHasDelivery(service.category || "otro") && (
              <Field label="Tiempo de entrega (opcional)">
                <TextInput
                  value={service.deliveryTime || ""}
                  onChange={(e) => setService(i, { deliveryTime: e.target.value })}
                  placeholder="Ej. 5 días hábiles"
                />
              </Field>
            )}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Qué incluye</span>
              {service.features.length > 0 && (
                <ul className="space-y-1">
                  {service.features.map((f, fi) => (
                    <li
                      key={`${f}-${fi}`}
                      className="flex items-center justify-between rounded-lg border border-sidebar-border bg-background/50 px-2.5 py-1.5 text-[11px] text-foreground"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="size-3 text-primary" /> {f}
                      </span>
                      <button
                        type="button"
                        onClick={() => setService(i, { features: service.features.filter((_, idx) => idx !== fi) })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <FeatureAdder onAdd={(feature) => setService(i, { features: [...service.features, feature] })} />
            </div>
            <Field label="Enlace de reserva o cotización (opcional)">
              <TextInput
                value={service.bookingUrl || ""}
                onChange={(e) => setService(i, { bookingUrl: e.target.value })}
                placeholder="https://calendly.com/... o tu WhatsApp wa.me/..."
              />
            </Field>
            <Field label="Imagen (opcional)">
              <ImageUploader
                currentImageUrl={service.imageUrl}
                onUploadReady={(url) => setService(i, { imageUrl: url })}
                blobRegistry={blobRegistry}
              />
            </Field>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={service.isActive}
                  onChange={(e) => setService(i, { isActive: e.target.checked })}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Visible
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={service.isFeatured}
                  onChange={(e) => setService(i, { isFeatured: e.target.checked })}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Destacado
              </label>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { collectMediaUrls } from "@/lib/media-url"
import { useRouter, useSearchParams } from "next/navigation"
import { type Block, type BlockType, type TracksData, type CreditsData, createBlock, dbBlockToBlock, defaultData, isKnownBlockType, mergePublicacionesEmbeds, SINGLETON_BLOCK_TYPES } from "@/lib/blocks"
import { evaluarLoteSegunModo } from "@/lib/blocks-schema"
import { revalidarPerfilPublico } from "@/app/acciones/revalidar-perfil"
import { type CatalogProduct, type CatalogService, fetchCatalog, normalizeDraftProduct, normalizeDraftService } from "@/lib/catalog"
import { type BandRole, getActiveBandId, setActiveBandId, getEffectiveBandRole } from "@/lib/bands"
import { EditorHeader } from "@/components/editor-header"
import { CatalogReconciliation, type CatalogChoice } from "@/components/catalog-reconciliation"
import { BlockLibrary } from "@/components/block-library"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BlockInspector, audioBitrateByFile } from "@/components/block-inspector"
import { Layers, LogOut, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { createVerifiedUploadAttempt } from "@/lib/upload-protocol"
import { sanitizeUrlFields } from "@/lib/safe-url"
import { EditorPersistence, EditorPersistenceError, readEditorState } from "@/lib/editor-persistence"
import { UploadFeedbackError } from "@/lib/upload-feedback"
import { createEditorCopy } from "@/lib/editor-copy"
import { mergeUploadedUrls } from "@/lib/upload-merge"
import { ensureOwnProfile, resolveOwnProfileId } from "@/lib/ensure-profile"
import imageCompression from "browser-image-compression"
import { ensureCompressedAudio, DEFAULT_AUDIO_BITRATE } from "@/lib/audio-transcode"
import { logSupabaseError } from "@/lib/log-supabase-error"
import { ProfileSkeleton } from "@/components/blocks/skeletons"
import { useToast } from "@/components/toast-provider"

type DragPayload = { kind: "new"; type: BlockType } | { kind: "reorder"; index: number } | null

// ─── Helpers para escanear y reemplazar blob URLs ─────────────────────────

/**
 * Dado un bloque, devuelve todos los strings que son blob URLs
 * junto con la ruta de la propiedad que los contiene.
 */
function collectBlobPaths(data: Record<string, unknown> | null | undefined, prefix = ""): { path: string; url: string }[] {
  if (!data) return []
  const results: { path: string; url: string }[] = []

  for (const [key, value] of Object.entries(data)) {
    const currentPath = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string" && value.startsWith("blob:")) {
      results.push({ path: currentPath, url: value })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") {
          results.push(...collectBlobPaths(item as Record<string, unknown>, `${currentPath}[${i}]`))
        }
      })
    } else if (value && typeof value === "object") {
      results.push(...collectBlobPaths(value as Record<string, unknown>, currentPath))
    }
  }

  return results
}

/**
 * Aplica un valor a una ruta de propiedad profunda.
 * Soporta notación de puntos y arrays: "products[0].image"
 */
function setDeep(obj: Record<string, unknown>, path: string, value: string): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = clone
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
  return clone
}

/**
 * Una blob URL solo vive en el documento que la creó — no sobrevive a un
 * recargo de página ni a una nueva pestaña. Guardarlas en draft_content hace
 * que, al volver a cargar el editor, el navegador intente pedir un recurso
 * que ya no existe ("Not allowed to load local resource: blob:..."). Antes
 * de persistir o de hidratar el borrador, se limpian a "" para no arrastrar
 * referencias muertas.
 */
function stripDeadBlobUrls<T extends Record<string, unknown>>(data: T): T {
  let result: Record<string, unknown> = data
  for (const { path } of collectBlobPaths(data)) {
    result = setDeep(result, path, "")
  }
  return result as T
}

/**
 * Extrae todas las URLs de R2 (Cloudflare) presentes en cualquier parte de
 * un valor (bloques, productos, servicios...), sin importar cuán anidada
 * esté. Se usa en handlePublish para comparar "qué archivos usaba lo ya
 * publicado" contra "qué archivos usa lo que se acaba de publicar" y borrar
 * de R2 los que quedaron huérfanos (ej. el usuario reemplazó una pista o
 * una imagen por otra).
 */
function extractR2Urls(value: unknown): Set<string> {
  return collectMediaUrls(value)
}

// Algunos navegadores detectan mal el MIME type de ciertos archivos de audio
// (ej. reportan .mp3/.mpeg como "video/mpeg"), lo que el bucket de Supabase
// rechaza. Para la carpeta "audio" NUNCA confiamos en la detección del
// navegador (file.type): siempre se fuerza un tipo audio/* válido.
const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpg: "audio/mpeg",
  mp2: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  aiff: "audio/aiff",
  aif: "audio/aiff",
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * Comprime y convierte una imagen a WebP (<500KB) antes de subirla. Esto
 * corre al preparar la subida, invisible para el usuario — no hace
 * falta tocar nada en los uploaders individuales (avatar, banner, portadas,
 * pistas, merch, etc).
 */
async function compressImage(file: File, cancellation?: AbortSignal): Promise<File> {
  cancellation?.throwIfAborted()
  try {
    const compressed = await imageCompression(file, {
      signal: cancellation,
      maxSizeMB: 0.5,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.82,
    })
    cancellation?.throwIfAborted()
    return new File([compressed], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" })
  } catch {
    cancellation?.throwIfAborted()
    // Si la compresión falla (ej. formato no soportado por el navegador),
    // se sube el archivo original en vez de bloquear la publicación.
    return file
  }
}

/**
 * Prepara los bytes una vez y devuelve un intento repetible vinculado a
 * cuenta y perfil. El transporte no devuelve URL hasta verificar la subida.
 */
async function prepareFileUpload(file: File, folder: "images" | "audio", ownerUserId: string, profileId: string, cancellation?: AbortSignal): Promise<(cancellation?: AbortSignal) => Promise<string>> {
  cancellation?.throwIfAborted()
  const uploadFile = folder === "images" ? await compressImage(file, cancellation) : file
  cancellation?.throwIfAborted()
  const ext = (uploadFile.name.split(".").pop() ?? "bin").toLowerCase()
  // Se usa || y no ?? a propósito: file.type puede venir como cadena VACÍA
  // (el navegador no reconoció el archivo), y "" es un valor que ?? deja
  // pasar. /api/upload-url ahora exige un content type multimedia válido, así
  // que una cadena vacía haría fallar la subida con 400.
  const contentType =
    folder === "audio"
      ? AUDIO_MIME_TYPES[ext] || "audio/mpeg"
      : IMAGE_MIME_TYPES[ext] || uploadFile.type || "image/webp"

  const uploadBody =
    uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType })

  return createVerifiedUploadAttempt(uploadBody, folder, ownerUserId, profileId)
}

// WeakMap: los intentos dejan de retener archivos cuando desaparecen del editor.
// Cuenta, perfil y bitrate separan reservas que no son intercambiables.
const editorUploadAttempts = new WeakMap<File, Map<string, Promise<(cancellation?: AbortSignal) => Promise<string>>>>()
type UploadStage = "preparing" | "transferring" | "ready"
type UploadStageListener = (url: string, stage: UploadStage) => void

// No liberar Publicar al primer rechazo mientras otras subidas siguen activas.
async function settleUploads<T>(uploads: Promise<T>[], onFailure: () => void): Promise<T[]> {
  const results = await Promise.allSettled(uploads.map(upload => upload.catch(error => {
    onFailure()
    throw error
  })))
  const failed = results.find(result => result.status === "rejected")
  if (failed?.status === "rejected") throw failed.reason
  return results.map(result => {
    if (result.status !== "fulfilled") throw new Error("No se completaron los archivos.")
    return result.value
  })
}

/**
 * Sube el File registrado para una blob URL. Si por alguna razón el File ya
 * no está en el registro (ej. el editor se remontó a mitad de camino),
 * aborta la publicación con un error claro en vez de guardar un link muerto
 * ("blob:https://...", roto apenas se cierra esa pestaña) en
 * profile_blocks/products/services.
 *
 * A propósito NO se borra la entrada del registro ni se revoca la blob URL
 * acá: un bloque/producto puede tener varias imágenes (ver MultiImageUploader
 * en legado/merch), y resolveEntityBlobs las sube una por una dentro del
 * mismo item. Si la primera sube bien pero la segunda falla (red inestable,
 * R2 caído un instante), antes esta función ya había borrado el registro de
 * la primera — así que reintentar publicar volvía a fallar con "no se
 * encontró el archivo" para una imagen que sí se había subido, sin forma de
 * reintentar salvo volviendo a seleccionarla a mano. La limpieza real del
 * registro pasa recién al final de handlePublish, cuando TODO el publish
 * terminó con éxito.
 */
async function uploadBlobFile(url: string, blobRegistry: Map<string, File>, profileId: string, expectedOwner: string, onStage?: UploadStageListener, cancellation?: AbortSignal): Promise<string> {
  cancellation?.throwIfAborted()
  const file = blobRegistry.get(url)
  if (!file) {
    throw new Error(
      "No se encontró el archivo de una imagen o audio recién agregado. Volvé a subirlo e intentá publicar de nuevo."
    )
  }
  // `file.type` no es confiable para decidir la carpeta: algunos navegadores
  // reportan ciertos .mp3 como "video/mpeg" (el mismo problema documentado
  // arriba, en AUDIO_MIME_TYPES). Con ese MIME, "video/mpeg".startsWith("audio")
  // es falso, así que el audio se enrutaba como si fuera una imagen — pasaba
  // por la compresión de imágenes y se publicaba con el MIME incorrecto, que
  // Supabase Storage termina rechazando. La extensión del archivo es la señal
  // confiable: si el navegador la validó como .mp3, es audio.
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  const folder: "images" | "audio" = ext in AUDIO_MIME_TYPES ? "audio" : "images"
  // Cualquier audio que no sea ya mp3/aac/m4a (ej. wav, flac, aiff) se
  // transcodifica en el navegador antes de subir — ver lib/audio-transcode.
  // El bitrate lo eligió el artista en el selector del AudioUploader; queda
  // asociado al File en audioBitrateByFile (ver block-inspector.tsx) porque
  // ese es el único hilo que conecta "qué se eligió" con "qué archivo es" —
  // pasa mucho tiempo (hasta que se publica) entre una cosa y la otra.
  const bitrate = audioBitrateByFile.get(file) ?? DEFAULT_AUDIO_BITRATE
  onStage?.(url, "preparing")
  const { data, error } = await supabase.auth.getSession()
  cancellation?.throwIfAborted()
  if (error || !data.session) throw new Error("Inicia sesión para completar la publicación.")
  const owner = data.session.user.id
  if (owner !== expectedOwner) throw new Error("La cuenta cambió durante la subida. Vuelve a abrir el perfil con la cuenta original.")
  const attemptKey = JSON.stringify([owner, profileId, folder, folder === "audio" ? bitrate : null])
  let attempts = editorUploadAttempts.get(file)
  if (!attempts) { attempts = new Map(); editorUploadAttempts.set(file, attempts) }
  const fileAttempts = attempts
  let prepared = fileAttempts.get(attemptKey)
  if (!prepared) {
    prepared = (async () => {
      const fileToUpload = folder === "audio" ? await ensureCompressedAudio(file, bitrate, undefined, cancellation) : file
      cancellation?.throwIfAborted()
      return prepareFileUpload(fileToUpload, folder, owner, profileId, cancellation)
    })()
    fileAttempts.set(attemptKey, prepared)
    void prepared.catch(() => { if (fileAttempts.get(attemptKey) === prepared) fileAttempts.delete(attemptKey) })
  }
  const run = await prepared
  cancellation?.throwIfAborted()
  onStage?.(url, "transferring")
  const permanentUrl = await run(cancellation)
  cancellation?.throwIfAborted()
  onStage?.(url, "ready")
  return permanentUrl
}

/**
 * Reemplaza todas las blob URLs de un bloque/producto/servicio por sus URLs
 * permanentes en Storage. Usado en handlePublish tanto para blocks como para
 * products/services — antes, solo blocks pasaba por acá, así que una imagen
 * de producto subida en el editor nunca se publicaba (se quedaba en blob:,
 * un link muerto en cuanto se cerraba la pestaña).
 */
async function resolveEntityBlobs<T extends Record<string, unknown>>(
  item: T,
  blobRegistry: Map<string, File>,
  profileId: string,
  expectedOwner: string,
  onStage?: UploadStageListener,
  cancellation?: AbortSignal
): Promise<T> {
  const blobPaths = collectBlobPaths(item)
  if (blobPaths.length === 0) return item

  let updated: Record<string, unknown> = { ...item }
  for (const { path, url } of blobPaths) {
    const permanentUrl = await uploadBlobFile(url, blobRegistry, profileId, expectedOwner, onStage, cancellation)
    updated = setDeep(updated, path, permanentUrl)
  }
  return updated as T
}

/**
 * El panel derecho (inspector) es estático y siempre visible desde xl
 * (escritorio) — ahí sí conviene mostrar el primer bloque ya seleccionado.
 * Por debajo de xl ese mismo panel se vuelve un overlay a pantalla completa
 * (ver profile-editor.tsx / block-inspector.tsx), así que seleccionar algo
 * por defecto en el celular tapaba TODA la pantalla apenas se entraba al
 * editor, sin forma de llegar al lienzo ni a "Bloques". Por eso el
 * auto-select solo aplica en escritorio.
 */
function defaultSelectedId(loadedBlocks: Block[]): string | null {
  if (typeof window === "undefined" || window.innerWidth < 1280) return null
  return loadedBlocks[0]?.id ?? null
}

// ─────────────────────────────────────────────────────────────────────────

export function ProfileEditor() {
  return (
    <Suspense fallback={null}>
      <ProfileEditorInner />
    </Suspense>
  )
}

function ProfileEditorInner() {
  const { showToast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [services, setServices] = useState<CatalogService[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload>(null)
  // Álbum que el usuario acaba de abrir en el lienzo (bloque "tracks") — se
  // pasa al inspector para que enfoque el mismo álbum del lado derecho, en
  // vez de quedarse en el primero por defecto.
  const [focusAlbumId, setFocusAlbumId] = useState<string | null>(null)
  // Drawer de "Bloques" en mobile/tablet (< xl) — el aside se vuelve un
  // overlay a pantalla completa en vez de compartir espacio con el lienzo.
  const [mobileBlocksOpen, setMobileBlocksOpen] = useState(searchParams.get("abrir") === "bloques")
  const [publishing, setPublishing] = useState(false)
  const [publishStage, setPublishStage] = useState("")
  const [loading, setLoading] = useState(true)
  // Slug de la página pública ya publicada (deriva de profiles.display_name)
  // — solo existe una vez que el artista publicó al menos una vez.
  const [publicSlug, setPublicSlug] = useState("")
  const [editorProfile, setEditorProfile] = useState<{ id: string | null; isBand: boolean }>({ id: null, isBand: false })
  // Rol efectivo del usuario sobre el perfil que se está editando ahora
  // mismo — "owner" para el perfil personal o una banda propia, "admin"/
  // "editor" para un miembro de banda. Controla qué puede tocar en el
  // lienzo (ver bloqueo de bloques más abajo).
  const [activeRole, setActiveRole] = useState<BandRole>("owner")
  const [confirmedDraft, setConfirmedDraft] = useState<string | null>(null)
  const [draftWrites, setDraftWrites] = useState(0)
  const [draftFailed, setDraftFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sessionChanged, setSessionChanged] = useState(false)
  const [draftEverSaved, setDraftEverSaved] = useState(false)
  const [catalogComparison, setCatalogComparison] = useState<CatalogChoice | null>(null)
  const [catalogChoiceBusy, setCatalogChoiceBusy] = useState(false)
  const [catalogChoiceError, setCatalogChoiceError] = useState("")
  const catalogChoiceLock = useRef(false)
  const draftSnapshot = JSON.stringify({ blocks, products, services })
  // Los archivos blob sólo viven en esta pestaña hasta publicarse.
  const hasLocalFiles = collectBlobPaths({ blocks, products, services }).length > 0
  const draftPending = confirmedDraft !== null && draftSnapshot !== confirmedDraft
  const draftMessage = publishing ? publishStage || "Preparando publicación…"
    : draftFailed ? "Guardado no confirmado. Conserva esta pestaña y tus cambios antes de recargar."
    : draftWrites > 0 ? "Guardando borrador…"
    : draftPending ? "Cambios pendientes de guardar…"
    : hasLocalFiles ? "Texto guardado. Hay archivos locales: publica para conservarlos antes de salir."
    : !draftEverSaved ? "Contenido cargado. Tus próximos cambios se guardarán como borrador."
    : "Borrador guardado. Los cambios se hacen públicos al publicar."
  // Aviso de salida al presionar "atrás" en el celular (ver efecto de
  // bloqueo de historial más abajo) — la única salida real desde ese gesto
  // es cerrar sesión; "Volver al feed" del header sigue funcionando normal
  // porque navega con un Link, no dispara "popstate".
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [loggingOutFromEditor, setLoggingOutFromEditor] = useState(false)
  const logoutLock = useRef(false)
  const exitDialogRef = useRef<HTMLDialogElement>(null)
  const keepEditingRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!showExitConfirm) return
    const dialog = exitDialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    keepEditingRef.current?.focus()
    return () => {
      dialog?.close()
      previousFocus?.focus()
    }
  }, [showExitConfirm])

  /**
   * Registro de blob URLs → File real.
   * Cuando ImageUploader o AudioUploader crean una blob URL,
   * la registran aquí. handlePublish lo consulta al guardar.
   */
  const blobRegistryRef = useRef<Map<string, File>>(new Map())
  useEffect(() => {
    const registry = blobRegistryRef.current
    return () => {
      for (const url of registry.keys()) if (url.startsWith("blob:")) URL.revokeObjectURL(url)
      registry.clear()
    }
  }, [])
  // Id de perfil resuelto en la carga — el autoguardado de borrador lo reutiliza
  // para no repetir la consulta de auth en cada cambio.
  const profileIdRef = useRef<string | null>(null)
  // true si profileIdRef apunta a una banda (no al perfil personal del
  // usuario logueado) — handlePublish lo usa para no reescribir la fila
  // `profiles` equivocada al hacer upsert.
  const isBandRef = useRef(false)
  // Evita que el autoguardado de borrador (is_visible:false) sobrescriba,
  // en el ciclo inmediatamente siguiente, las filas que Publish acaba de
  // marcar como is_visible:true.
  const skipNextAutosaveRef = useRef(false)
  const allowProfileReloadRef = useRef(false)
  const lastPublishedRef = useRef<string | null>(null)
  // Versión de contenido sobre la que se está editando. Se manda al publicar
  // para que la base rechace el guardado si alguien más publicó mientras
  // tanto, en vez de pisarlo en silencio (ver 0007_optimistic_concurrency).
  const persistenceRef = useRef<EditorPersistence | null>(null)
  const editorUserIdRef = useRef<string | null>(null)
  const publishingRef = useRef(false)
  const publicationPreparation = useRef<AbortController | null>(null)

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  useEffect(() => {
    let active = true
    let invalidated = false
    let observedIdentity: string | null | undefined
    function invalidateSession() {
      if (!active || invalidated) return
      invalidated = true
      publicationPreparation.current?.abort()
      persistenceRef.current = null
      editorUserIdRef.current = null
      setSessionChanged(true)
      setLoading(false)
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextIdentity = session?.user.id ?? null
      if (observedIdentity !== undefined && observedIdentity !== nextIdentity) invalidateSession()
      observedIdentity = nextIdentity
    })
    function canLoad(userId: string) {
      if (!active || invalidated) return false
      if (observedIdentity !== undefined && observedIdentity !== userId) {
        invalidateSession()
        return false
      }
      observedIdentity = userId
      return true
    }
    async function loadSavedBlocks() {
      try {
        // profile_blocks/products/services están indexados por el id real de
        // la fila `profiles`, resuelta a partir del usuario autenticado.
        //
        // Antes, sin sesión se caía al perfil semilla PROFILE_ID: eso hacía
        // que cualquier visitante anónimo de /dashboard editara —y pisara—
        // un perfil compartido. Ahora sin sesión se manda a /login, y si la
        // cuenta todavía no tiene fila, ensureOwnProfile se la crea.
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (!active || invalidated) return
        if (authError) throw new Error("No se pudo comprobar tu sesión.")
        if (!user) {
          router.replace("/login")
          return
        }
        if (!canLoad(user.id)) return

        const ownProfile = await ensureOwnProfile(user)
        if (!canLoad(user.id)) return
        if (!ownProfile) {
          throw new Error("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.")
        }

        let profileId = ownProfile.id
        let isBand = false
        let effectiveUsername = ownProfile.username
        let role: BandRole = "owner"

        // Punto 4: si el switcher tiene una banda seleccionada para este
        // usuario, se edita esa banda en vez del perfil personal — siempre
        // que el rol siga siendo válido (el dueño pudo haber quitado al
        // usuario desde la última vez). Si ya no es válida, se limpia la
        // selección y se cae de vuelta al perfil personal sin romper nada.
        if (user) {
          const selectedBandId = getActiveBandId(user.id)
          if (selectedBandId) {
            const bandRole = await getEffectiveBandRole(selectedBandId, user.id)
            if (!canLoad(user.id)) return
            const { data: bandProfile, error: bandError } = bandRole
              ? await supabase.from("profiles").select("id, username").eq("id", selectedBandId).eq("profile_type", "band").maybeSingle()
              : { data: null, error: null }
            if (!canLoad(user.id)) return
            if (bandError) throw new Error("No se pudo cargar el grupo seleccionado.")

            if (bandRole && bandProfile) {
              profileId = bandProfile.id
              effectiveUsername = bandProfile.username ?? ""
              isBand = true
              role = bandRole
            } else {
              setActiveBandId(user.id, null)
            }
          }
        }

        const editorState = await readEditorState(profileId)
        if (!canLoad(user.id)) return

        // El enlace público usa el username real, no un slug derivado del
        // nombre: dos artistas pueden llamarse igual, y renombrarse no debe
        // romper los QR ni los enlaces ya compartidos. Ver lib/username.ts.

        // La lectura versionada anterior debe confirmarse antes de editar:
        // un error de borrador no permite cargar contenido público como si
        // fuera un borrador vacío y sobrescribir el trabajo pendiente.
        type EditorDraft = { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] }
        const draft = editorState.draft_content as EditorDraft | null

        if (draft) {
          if (editorState.draft_content?.catalog_base_version !== editorState.content_version) {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            if (!canLoad(user.id)) return
            if (sessionError || sessionData.session?.user.id !== user.id) throw new Error("Sesión no disponible")
            const token = sessionData.session.access_token
            const currentCatalog = await fetchCatalog(profileId, token)
            if (!canLoad(user.id)) return
            const afterCatalog = await readEditorState(profileId, token)
            if (!canLoad(user.id)) return
            if (afterCatalog.content_version !== editorState.content_version || afterCatalog.draft_revision !== editorState.draft_revision) {
              throw new Error("El catálogo cambió mientras se cargaba")
            }
            setCatalogComparison(currentCatalog)
          }
          const cleanBlocks = (draft.blocks ?? [])
            .filter((b) => isKnownBlockType(b.type))
            .map((b) => ({
              ...b,
              data: stripDeadBlobUrls(b.data as Record<string, unknown>) as Block["data"],
            }))
          const loadedBlocks = mergePublicacionesEmbeds(cleanBlocks)
          setBlocks(loadedBlocks)
          // En escritorio el panel de la derecha se abre solo, con el primer
          // elemento de la página (normalmente Perfil/Banner Principal) ya
          // seleccionado. En móvil arranca cerrado (ver defaultSelectedId).
          setSelectedId(defaultSelectedId(loadedBlocks))
          setProducts(
            (draft.products ?? []).map((p) =>
              normalizeDraftProduct(stripDeadBlobUrls(p as unknown as Record<string, unknown>))
            )
          )
          setServices(
            (draft.services ?? []).map((s) =>
              normalizeDraftService(stripDeadBlobUrls(s as unknown as Record<string, unknown>))
            )
          )
        } else {
          const { data: dbBlocks, error } = await supabase
            .from("profile_blocks")
            .select("id, block_type, content, position_index")
            .eq("profile_id", profileId)
            .order("position_index", { ascending: true })

          if (!canLoad(user.id)) return
          if (error) throw error

          // Lo publicado NUNCA debería tener blob URLs (se resuelven a permanentes
          // antes de insertar en profile_blocks) pero se limpian igual por las
          // dudas: si alguna llegó a quedar guardada por un bug de publicación
          // ya corregido, mostrar "Subir imagen" es mejor que un thumbnail roto
          // para siempre apuntando a un blob: muerto de otra sesión.
          const loadedBlocks =
            dbBlocks && dbBlocks.length > 0
              ? mergePublicacionesEmbeds(
                  dbBlocks
                    .filter((b) => isKnownBlockType(b.block_type))
                    .map((b) => dbBlockToBlock(b, { isBand }))
                    .map((b) => ({ ...b, data: stripDeadBlobUrls(b.data as Record<string, unknown>) as Block["data"] }))
                )
              : [createBlock("hero"), createBlock("tracks"), createBlock("merch")]
          const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profileId)
          if (!canLoad(user.id)) return
          setBlocks(loadedBlocks)
          setSelectedId(defaultSelectedId(loadedBlocks))
          setProducts(catalogProducts)
          setServices(catalogServices)
        }
        profileIdRef.current = profileId
        isBandRef.current = isBand
        setEditorProfile({ id: profileId, isBand })
        setActiveRole(role)
        setPublicSlug(effectiveUsername)
        editorUserIdRef.current = user.id
        persistenceRef.current = new EditorPersistence(profileId, editorState, user.id)
        skipNextAutosaveRef.current = true
      } catch (err) {
        if (!active || invalidated) return
        persistenceRef.current = null
        editorUserIdRef.current = null
        setLoadFailed(true)
        showToast("No se pudo cargar tu contenido. Recarga la página antes de guardar o publicar.", "error")
        logSupabaseError("editor: carga inicial", err)
        const fallbackBlocks = [createBlock("hero"), createBlock("tracks"), createBlock("merch")]
        setBlocks(fallbackBlocks)
        setSelectedId(defaultSelectedId(fallbackBlocks))
      } finally {
        if (active && !invalidated) setLoading(false)
      }
    }
    loadSavedBlocks()
    return () => {
      active = false
      publicationPreparation.current?.abort()
      authListener.subscription.unsubscribe()
      persistenceRef.current = null
      editorUserIdRef.current = null
    }
  }, [router, showToast])

  // Autoguardado de borrador: cada cambio se sube a profiles.draft_content
  // (columna aparte, nunca leída por el perfil público). No toca
  // profile_blocks/products/services — esas tablas son lo que ya está
  // publicado y solo cambian cuando se presiona Publish.
  useEffect(() => {
    if (loading || publishing || loggingOutFromEditor || catalogComparison || !persistenceRef.current) return
    if (draftSnapshot === lastPublishedRef.current) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      setConfirmedDraft(draftSnapshot)
      return
    }
    const profileId = profileIdRef.current
    if (!profileId) return
    const persistence = persistenceRef.current

    const timeout = setTimeout(async () => {
      if (publishingRef.current || logoutLock.current || persistenceRef.current !== persistence) return
      setDraftWrites(count => count + 1)
      try {
      // Se guardan las blob URLs vigentes tal cual (siguen siendo válidas en
      // esta misma pestaña, así la vista previa no parpadea), pero se limpian
      // antes de escribir a Supabase para no persistir referencias que
      // morirán en cuanto se cierre o recargue esta pestaña.
      const sanitizedBlocks = blocks.map((b) => ({
        ...b,
        data: stripDeadBlobUrls(b.data as Record<string, unknown>) as Block["data"],
      }))
      const sanitizedProducts = products.map(
        (p) => stripDeadBlobUrls(p as unknown as Record<string, unknown>) as unknown as CatalogProduct
      )
      const sanitizedServices = services.map(
        (s) => stripDeadBlobUrls(s as unknown as Record<string, unknown>) as unknown as CatalogService
      )
        await persistence.save({
          blocks: sanitizedBlocks,
          products: sanitizedProducts,
          services: sanitizedServices,
        })
        if (persistenceRef.current !== persistence) return
        setConfirmedDraft(draftSnapshot)
        setDraftEverSaved(true)
        setDraftFailed(false)
      } catch (error) {
        setDraftFailed(true)
        showToast(error instanceof Error ? error.message : "No se pudo guardar el borrador.", "error")
      } finally {
        setDraftWrites(count => count - 1)
      }
    }, 1500)

    return () => clearTimeout(timeout)
  }, [blocks, products, services, draftSnapshot, loading, publishing, loggingOutFromEditor, catalogComparison, showToast])

  useEffect(() => {
    if (loading || loadFailed || (!sessionChanged && !draftPending && !draftFailed && draftWrites === 0 && !hasLocalFiles && !publishing)) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (allowProfileReloadRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnBeforeLeaving)
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving)
  }, [loading, loadFailed, sessionChanged, draftPending, draftFailed, draftWrites, hasLocalFiles, publishing])

  // ── Bloqueo del botón "atrás" del celular dentro del editor ────────────
  // El editor es una app a pantalla completa: un "atrás" accidental (gesto
  // o botón físico) no debe sacar de golpe al usuario de Vibe. Se arma una
  // trampa de historial — cada "atrás" se absorbe con un pushState y en su
  // lugar se muestra un aviso; la única forma real de salir desde ese gesto
  // es cerrar sesión (ver handleExitLogout). Solo aplica en pantallas
  // táctiles: en escritorio el botón "atrás" del navegador se deja intacto.
  useEffect(() => {
    if (loading) return
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return

    history.pushState({ vibeEditorGuard: true }, "", window.location.href)

    function handlePopState() {
      history.pushState({ vibeEditorGuard: true }, "", window.location.href)
      setShowExitConfirm(true)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [loading])

  async function handleExitLogout() {
    if (logoutLock.current || publishingRef.current || draftWrites > 0) return
    if ((draftPending || draftFailed || hasLocalFiles) && !window.confirm("¿Cerrar sesión y descartar los cambios sin guardar y los archivos locales sin publicar?")) return
    logoutLock.current = true
    setLoggingOutFromEditor(true)
    try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    allowProfileReloadRef.current = true
    // Navegación dura (no router.push): así se sale de verdad de la trampa
    // de historial de arriba en vez de quedar atrapado en el mismo ciclo.
    //
    // Next 16.3 añadió `no-location-assign-relative-destination`, que pide
    // `router.push()` para destinos internos. Aquí es exactamente lo que NO
    // se debe hacer: `router.push()` es navegación de cliente, no descarta el
    // historial ni reinicia el estado del editor, así que el `popstate` de
    // arriba volvería a capturar el gesto y el usuario quedaría encerrado
    // después de cerrar sesión. La recarga completa es el mecanismo, no un
    // descuido.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/"
    } catch {
      logoutLock.current = false
      setLoggingOutFromEditor(false)
      showToast("No pudimos cerrar la sesión. Conserva tus cambios e inténtalo de nuevo.", "error")
    }
  }

  // ── Generación de banner con IA ──────────────────────────────────────
  async function generarBannerConIA(promptTexto: string, signal: AbortSignal): Promise<File> {
    const owner = editorUserIdRef.current
    const persistence = persistenceRef.current
    if (!owner || !persistence || publishingRef.current || sessionChanged) throw new Error("Espera a que el editor esté disponible.")
    const { data, error } = await supabase.auth.getSession()
    const validContext = () => editorUserIdRef.current === owner && persistenceRef.current === persistence && !signal.aborted
    if (error || data.session?.user.id !== owner || !validContext()) throw new Error("La sesión cambió. Vuelve a abrir el editor.")
    const res = await fetch("/api/generate-image", {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(95_000)]),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ prompt: promptTexto, output: "file" }),
      })
    if (!res.ok) throw new Error(res.status === 503 ? "La generación con IA todavía no está disponible." : res.status === 429 ? "Alcanzaste el límite de generación. Inténtalo más tarde." : "No pudimos generar la imagen. Inténtalo más tarde.")
    const blob = await res.blob()
    if (!validContext()) throw new Error("La sesión cambió. Vuelve a abrir el editor.")
    if (blob.type !== "image/png" || blob.size === 0 || blob.size > 5 * 1024 * 1024) throw new Error("La imagen recibida no es válida.")
    return new File([blob], "banner-generado.png", { type: "image/png" })
  }

  // ── Publicación con subida inteligente de archivos ────────────────────
  async function chooseCatalog(source: "draft" | "published") {
    const persistence = persistenceRef.current
    if (!persistence || !catalogComparison || catalogChoiceLock.current || publishingRef.current || sessionChanged) return
    const confirmed = window.confirm(source === "published"
      ? "¿Usar los productos y servicios de la tienda publicada en este borrador? Los bloques del perfil se conservarán. Puedes cancelar para descargar antes una copia de ambas opciones."
      : "¿Conservar el catálogo del borrador? Cuando publiques, sustituirá los productos y servicios de la tienda actual. Los bloques del perfil se conservarán.")
    if (!confirmed) return
    const chosen = source === "published" ? catalogComparison : { products, services }
    catalogChoiceLock.current = true
    setCatalogChoiceBusy(true)
    setCatalogChoiceError("")
    setDraftWrites(count => count + 1)
    try {
      await persistence.reconcileCatalog({
        blocks: blocks.map(b => ({ ...b, data: stripDeadBlobUrls(b.data as Record<string, unknown>) })),
        products: chosen.products.map(p => stripDeadBlobUrls(p as unknown as Record<string, unknown>)),
        services: chosen.services.map(s => stripDeadBlobUrls(s as unknown as Record<string, unknown>)),
      })
      if (persistenceRef.current !== persistence) return
      setProducts(chosen.products)
      setServices(chosen.services)
      setConfirmedDraft(JSON.stringify({ blocks, products: chosen.products, services: chosen.services }))
      setDraftEverSaved(true)
      setDraftFailed(false)
      // The choice was explicitly saved above; don't immediately autosave it again.
      skipNextAutosaveRef.current = true
      setCatalogComparison(null)
      showToast("Elección guardada en el borrador. La tienda pública todavía no cambió.", "success")
    } catch {
      if (persistenceRef.current !== persistence) return
      setCatalogChoiceError("No pudimos confirmar tu elección o el contenido cambió mientras comparabas. Guarda una copia de ambas opciones y vuelve a cargar el editor para revisar el estado guardado.")
    } finally {
      catalogChoiceLock.current = false
      setDraftWrites(count => count - 1)
      if (persistenceRef.current === persistence) setCatalogChoiceBusy(false)
    }
  }

  async function downloadDraftCopy() {
    const owner = editorUserIdRef.current
    const persistence = persistenceRef.current
    if (!owner || !persistence || sessionChanged || loadFailed) return
    if (!window.confirm("Descargarás un archivo con los textos, la estructura y el catálogo de este borrador. No incluye audios ni imágenes: conserva los archivos originales. Sirve como copia de consulta; todavía no hay importación automática. ¿Descargar?")) return
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || data.session?.user.id !== owner || editorUserIdRef.current !== owner || persistenceRef.current !== persistence) return
      const copy = createEditorCopy({ blocks, products, services }, blobRegistryRef.current)
      const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url
      link.download = `vibe-borrador-${copy.createdAt.slice(0, 10)}.json`
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      showToast("Descarga solicitada. Comprueba que el archivo se guardó y conserva también tus audios e imágenes originales.", "success")
    } catch {
      showToast("No se pudo preparar la copia. Mantén el editor abierto para conservar tus cambios.", "error")
    }
  }

  async function handlePublish() {
    if (publishingRef.current || catalogComparison || catalogChoiceLock.current) return
    const persistence = persistenceRef.current
    const editorUserId = editorUserIdRef.current
    if (!persistence || !editorUserId) {
      showToast("Recarga la página para cargar tu contenido antes de publicar.", "error")
      return
    }
    publishingRef.current = true
    const preparation = new AbortController()
    publicationPreparation.current = preparation
    setPublishing(true)
    setPublishStage("Preparando publicación…")
    let publicationConfirmed = false
    try {
      const uploadProfileId = profileIdRef.current
      if (!uploadProfileId) throw new Error("No se pudo comprobar el perfil de la publicación.")
      async function assertPublicationContext() {
        preparation.signal.throwIfAborted()
        const { data, error } = await supabase.auth.getSession()
        preparation.signal.throwIfAborted()
        if (error || data.session?.user.id !== editorUserId || persistenceRef.current !== persistence || profileIdRef.current !== uploadProfileId) {
          throw new Error("La cuenta o el perfil cambió durante la publicación. Conserva tus cambios y vuelve al perfil original.")
        }
        return data.session.access_token
      }
      await assertPublicationContext()
      const files = new Set(collectBlobPaths({ blocks, products, services }).map(item => item.url))
      const stages = new Map<string, UploadStage>()
      let uploadFailed = false
      const reportUploadFailure = () => {
        if (preparation.signal.aborted) return
        uploadFailed = true
        setPublishStage("Una subida no se completó. Esperando que terminen las demás antes de permitir el reintento…")
      }
      function waitForUploads<T>(uploads: Promise<T>[]) {
        return settleUploads(uploads, reportUploadFailure)
      }
      const onFileStage: UploadStageListener = (url, stage) => {
        if (preparation.signal.aborted) return
        if (uploadFailed) return
        if (!files.has(url)) return
        // La misma blob puede aparecer en varios bloques. No retroceder su estado.
        const rank = { preparing: 0, transferring: 1, ready: 2 }
        const previous = stages.get(url)
        if (previous && rank[previous] > rank[stage]) return
        stages.set(url, stage)
        const values = [...stages.values()]
        const ready = values.filter(value => value === "ready").length
        const preparing = values.filter(value => value === "preparing").length
        const transferring = values.filter(value => value === "transferring").length
        setPublishStage(`Archivos verificados: ${ready}/${files.size}. Preparando audio e imágenes: ${preparing}. Subiendo o verificando: ${transferring}.`)
      }
      // 1. Clonar bloques para trabajar sin mutar el estado de React
      let publishBlocks: Block[] = JSON.parse(JSON.stringify(blocks))

      // 2. Escanear bloques, productos y servicios buscando blob URLs y
      // subirlas a Storage antes de publicar.
      publishBlocks = await waitForUploads(
        publishBlocks.map(async (block) => {
          await assertPublicationContext()
          const updatedData = await resolveEntityBlobs(block.data as Record<string, unknown>, blobRegistryRef.current, uploadProfileId, editorUserId, onFileStage, preparation.signal)
          await assertPublicationContext()
          // Refleja la URL permanente en el estado de React para que la
          // vista previa deje de apuntar a una blob URL en cuanto termina.
          setBlocks((prev) => mergeUploadedUrls(prev, [block], [{ ...block, data: updatedData }]))
          return { ...block, data: updatedData as Block["data"] }
        })
      )

      const publishProducts: CatalogProduct[] = await waitForUploads(
        products.map(
          async (p) =>
            (await resolveEntityBlobs(p as unknown as Record<string, unknown>, blobRegistryRef.current, uploadProfileId, editorUserId, onFileStage, preparation.signal)) as unknown as CatalogProduct
        )
      )
      await assertPublicationContext()
      setProducts((prev) => mergeUploadedUrls(prev, products, publishProducts))

      const publishServices: CatalogService[] = await waitForUploads(
        services.map(
          async (s) =>
            (await resolveEntityBlobs(s as unknown as Record<string, unknown>, blobRegistryRef.current, uploadProfileId, editorUserId, onFileStage, preparation.signal)) as unknown as CatalogService
        )
      )
      await assertPublicationContext()
      setServices((prev) => mergeUploadedUrls(prev, services, publishServices))
      setPublishStage("Comprobando el perfil y preparando los cambios…")

      // 3. Resolver el id de perfil sobre el que se publica. Para una banda
      // (Punto 4) la fila ya existe desde que se creó — no se toca ni se
      // upsertea, solo se usa el id resuelto al cargar el editor. El upsert
      // por user_id de acá abajo es SOLO para el perfil personal: si se
      // reutilizara para una banda, el onConflict:"user_id" chocaría contra
      // la fila personal del usuario (las bandas tienen user_id NULL) y le
      // pisaría el nombre/bio a su propio perfil en vez de al de la banda.
      let profileId: string

      if (isBandRef.current && profileIdRef.current) {
        profileId = profileIdRef.current
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        // Publicar exige sesión: sin ella no hay perfil propio sobre el que
        // escribir (antes se caía al perfil semilla compartido PROFILE_ID).
        if (!user || user.id !== editorUserId) throw new Error("La sesión cambió. Vuelve a la cuenta original para publicar.")

        // ─── POR QUÉ ACÁ NO HAY UN UPSERT ────────────────────────────────
        // Hasta el 2026-08-17 esto hacía
        // `upsert({ user_id, display_name, bio }, { onConflict: "user_id" })`,
        // y **la publicación de todo perfil individual fallaba** con
        // `23502 null value in column "username"`.
        //
        // El motivo: `0006` dejó `profiles.username` NOT NULL y sin valor por
        // defecto. PostgREST traduce el upsert a
        // `INSERT ... ON CONFLICT (user_id) DO UPDATE`, y Postgres valida los
        // NOT NULL al ARMAR la fila candidata, antes de detectar el conflicto.
        // Que la fila ya existiera no salvaba nada: el insert nunca llegaba a
        // convertirse en update.
        //
        // Nadie lo había visto porque publicar exige sesión y hasta F8 no
        // había ni una prueba automática autenticada; lo destapó
        // `tests/e2e-auth/editor.spec.ts` en su primera corrida.
        //
        // El arreglo es además una escritura menos: para un perfil que ya
        // existe, aquel upsert reescribía `display_name` y `bio` con sus
        // propios valores — un no-op costoso. `resolveOwnProfileId` es el
        // helper canónico del repositorio para "encuentra mi perfil, y si no
        // existe créalo bien" (username incluido), y es el mismo que ya corre
        // al iniciar sesión y al cargar el editor.
        profileId = await resolveOwnProfileId(user)
      }

      if (profileId !== uploadProfileId) throw new Error("El perfil de la publicación cambió. Vuelve a cargar el editor.")
      await assertPublicationContext()

      // 3.5. Antes de sobrescribir lo publicado, guardar qué URLs de R2 usa
      // TODAVÍA (para poder borrar después las que este publish deja
      // huérfanas, ej. una pista o imagen reemplazada). Si esta lectura
      // falla, no debe tumbar la publicación — simplemente no se limpia R2
      // este ciclo, el archivo viejo queda para el próximo publish exitoso.
      let oldR2Urls = new Set<string>()
      try {
        const cleanupReadToken = await assertPublicationContext()
        const [{ data: oldBlocksRows }, { products: oldProducts, services: oldServices }] = await Promise.all([
          supabase.from("profile_blocks").select("content").eq("profile_id", profileId)
            .setHeader("Authorization", `Bearer ${cleanupReadToken}`),
          fetchCatalog(profileId, cleanupReadToken),
        ])
        oldR2Urls = new Set([
          ...extractR2Urls(oldBlocksRows),
          ...extractR2Urls(oldProducts),
          ...extractR2Urls(oldServices),
        ])
      } catch (err) {
        logSupabaseError("handlePublish: lectura previa a limpieza", err)
      }

      // 4. Reemplazar los bloques publicados, DE FORMA ATÓMICA.
      //
      // Antes esto eran un DELETE y un INSERT sueltos desde el navegador: si
      // el insert fallaba (red inestable en móvil, error de RLS, payload
      // rechazado) el perfil público quedaba VACÍO y sin vuelta atrás, porque
      // el borrador ya se había consumido. Ahora ambas sentencias viven
      // dentro de una función de Postgres, que corre en una sola transacción:
      // si algo falla, lo publicado anterior queda intacto.
      //
      // Último filtro antes de la base: ningún campo de enlace puede
      // persistirse con un esquema peligroso (javascript:, data:...). El
      // renderizado ya usa safeHref, pero esto evita que la fila sucia
      // llegue siquiera a guardarse — ver lib/safe-url.ts.
      const profileBlocksPayload = publishBlocks.map((b, index) => ({
        block_type: b.type,
        position_index: index,
        content: sanitizeUrlFields(b.data),
      }))

      // Validación de forma en runtime (P-08). TypeScript describe estos
      // objetos pero desaparece al compilar: sin esto, cualquier cosa llega a
      // profile_blocks.content. La capa gemela vive en la base (migración
      // 0010) — si una falla, la otra sostiene.
      //
      // Arranca en MODO OBSERVACIÓN: registra lo que habría rechazado y deja
      // publicar igual. Se activa el rechazo con
      // NEXT_PUBLIC_VALIDACION_BLOQUES=rechazar, después de revisar los
      // registros contra los perfiles reales. Ver lib/blocks-schema.ts.
      const errorDeValidacion = evaluarLoteSegunModo(profileBlocksPayload)
      if (errorDeValidacion) throw new Error(errorDeValidacion)

      setPublishStage("Guardando la publicación…")
      await assertPublicationContext()
      await persistence.publish(profileBlocksPayload, publishProducts, publishServices)
      publicationConfirmed = true
      await assertPublicationContext()
      // Registrar la confirmación antes de los trabajos auxiliares. Si un
      // certificado o la caché fallan, el autoguardado debe partir de lo que
      // realmente quedó publicado y conservar las ediciones más recientes.
      lastPublishedRef.current = JSON.stringify({ blocks: publishBlocks, products: publishProducts, services: publishServices })
      setConfirmedDraft(lastPublishedRef.current)
      setDraftEverSaved(true)
      setDraftFailed(false)
      setPublishStage("Publicación guardada. Completando los registros de las pistas…")

      // 4.5. Registrar el marcado de tiempo (certificado de autoría) de cada
      // pista que ya tiene huella SHA-256 calculada. Es "best effort": si
      // falla, no debe tumbar la publicación — el certificado simplemente
      // quedaría pendiente para el próximo publish. recordAuthorCertificate
      // ya es idempotente (ignora el conflicto si ya estaba registrado).
      const tracksBlocks = publishBlocks.filter((b) => b.type === "tracks")
      if (tracksBlocks.length > 0) {
        const { recordAuthorCertificate } = await import("@/lib/author-certificates")
        for (const block of tracksBlocks) {
          const albums = (block.data as TracksData).albums ?? []
          for (const album of albums) {
            for (const track of album.tracks) {
              if (!track.fileHash) continue
              await assertPublicationContext()
              try {
                await recordAuthorCertificate(profileId, {
                  songTitle: track.title || "Sin título",
                  fileHash: track.fileHash,
                }, editorUserId)
              } catch (err) {
                logSupabaseError("handlePublish: no se pudo registrar el certificado de autoría", err)
              }
            }
          }
        }
      }

      // La publicación ya está confirmada. La limpieza se solicita por lotes;
      // un fallo conserva archivos y se informa sin presentar el guardado como fallido.
      const newR2Urls = new Set([
        ...extractR2Urls(publishBlocks),
        ...extractR2Urls(publishProducts),
        ...extractR2Urls(publishServices),
      ])
      const orphanedR2Urls = [...oldR2Urls].filter((url) => !newR2Urls.has(url))
      let limpiezaPendiente = false
      if (orphanedR2Urls.length > 0) {
        setPublishStage("Revisando archivos reemplazados…")
        for (let offset = 0; offset < orphanedR2Urls.length; offset += 100) {
          try {
            const publicationToken = await assertPublicationContext()
            const response = await fetch("/api/delete-file", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicationToken}` },
              body: JSON.stringify({ urls: orphanedR2Urls.slice(offset, offset + 100) }),
              signal: AbortSignal.any([preparation.signal, AbortSignal.timeout(15_000)]),
            })
            if (!response.ok) { limpiezaPendiente = true; break }
            const result: unknown = await response.json()
            if (!result || typeof result !== "object" || !("failed" in result) ||
              !Array.isArray(result.failed) || result.failed.length > 0) {
              limpiezaPendiente = true
              break
            }
          } catch {
            limpiezaPendiente = true
            break
          }
        }
      }

      // Recién acá es seguro liberar el registro de blobs: todo lo que
      // apuntaba a blob: ya se subió y el estado ya quedó con las URLs
      // permanentes (ver los setBlocks/setProducts/setServices de arriba),
      // así que ninguna blob URL sigue en uso.
      // Las URLs nuevas que el usuario agregó durante la subida siguen vivas.
      // Las procesadas se conservan hasta desmontar; revocarlas aquí puede
      // adelantarse al commit del estado de React.

      // El perfil público se sirve desde una caché etiquetada (F10). Sin este
      // aviso, el artista publicaría y seguiría viendo lo viejo hasta cinco
      // minutos. Es best-effort a propósito: la publicación ya terminó bien, y
      // un fallo acá sólo significa que el cambio se verá cuando venza la
      // caché — nunca debe convertirse en un error de publicación.
      let cacheActualizada = true
      setPublishStage("Actualizando la página pública…")
      if (publicSlug) {
        try { cacheActualizada = await revalidarPerfilPublico(publicSlug) } catch { cacheActualizada = false }
      }

      if (preparation.signal.aborted) return
      const avisos = [
        !cacheActualizada && "La página pública puede tardar en actualizarse.",
        limpiezaPendiente && "La limpieza de algunos archivos anteriores quedó pendiente.",
      ].filter(Boolean)
      showToast(avisos.length ? `Cambios publicados. ${avisos.join(" ")} No necesitas volver a publicar.` : "¡Cambios publicados con éxito en tu perfil!", "success")
    } catch (err: unknown) {
      if (preparation.signal.aborted) return
      if (publicationConfirmed) {
        showToast("La publicación quedó guardada. No necesitas repetirla. Vuelve a abrir el perfil con la cuenta original para continuar.", "success")
        return
      }
      const message = err instanceof EditorPersistenceError || err instanceof UploadFeedbackError
        ? err.message
        : "No pudimos confirmar la publicación. Mantén el editor abierto para conservar tus cambios y archivos. Revisa tu perfil público antes de repetir el envío."
      logSupabaseError("handlePublish", err)
      showToast(message, "error")
    } finally {
      publishingRef.current = false
      if (publicationPreparation.current === preparation) publicationPreparation.current = null
      if (!preparation.signal.aborted) {
        setPublishing(false)
        setPublishStage("")
      }
    }
  }

  // ── Gestión de bloques ────────────────────────────────────────────────

  function canAddBlock(type: BlockType) {
    return !SINGLETON_BLOCK_TYPES.includes(type) || !blocks.some((b) => b.type === type)
  }

  function addBlock(type: BlockType) {
    if (!canAddBlock(type)) return
    const block = createBlock(type)
    setBlocks((prev) => [...prev, block])
    setSelectedId(block.id)
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id)
      const next = prev.filter((b) => b.id !== id)
      // El panel de la derecha siempre debe mostrar algo seleccionado — al
      // borrar el bloque activo, se selecciona el que quedó en su lugar (o
      // el anterior si era el último) en vez de dejar el panel vacío.
      setSelectedId((cur) => (cur === id ? next[Math.min(index, next.length - 1)]?.id ?? null : cur))
      return next
    })
  }

  // El banner principal (hero) nunca se borra del lienzo — este botón vacía
  // su contenido y lo deja en su lugar, en vez de eliminar el bloque.
  function clearBlockContent(id: string) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data: defaultData(b.type) } : b)))
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id)
      const target = index + dir
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  // Mueve un bloque a una posición absoluta del arreglo. Lo usa el
  // reordenamiento por pestañas del lienzo: los vecinos de una misma sección
  // no siempre son adyacentes en `blocks`. Misma corrección de índice que
  // handleDropAt para el caso "se mueve hacia adelante".
  function moveBlockToIndex(id: string, targetIndex: number) {
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === id)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const target = from < targetIndex ? targetIndex - 1 : targetIndex
      next.splice(Math.max(0, Math.min(target, next.length)), 0, moved)
      return next
    })
  }

  function updateBlock(id: string, data: Block["data"] | ((current: Block["data"]) => Block["data"])) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data: typeof data === "function" ? data(b.data) : { ...b.data, ...data } } : b)))
  }

  function handleDropAt(index: number) {
    if (!dragPayload) return
    if (dragPayload.kind === "new") {
      if (!canAddBlock(dragPayload.type)) {
        setDragPayload(null)
        return
      }
      const block = createBlock(dragPayload.type)
      setBlocks((prev) => {
        const next = [...prev]
        next.splice(index, 0, block)
        return next
      })
      setSelectedId(block.id)
    } else {
      const from = dragPayload.index
      setBlocks((prev) => {
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        const target = from < index ? index - 1 : index
        next.splice(target, 0, moved)
        return next
      })
    }
    navigator.vibrate?.(10)
    setDragPayload(null)
  }

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-64 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 sm:flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </aside>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <ProfileSkeleton />
          </main>
          <aside className="hidden w-72 shrink-0 border-l border-sidebar-border bg-sidebar p-4 lg:block">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-20 animate-pulse rounded-lg bg-muted" />
          </aside>
        </div>
      </div>
    )
  }

  if (sessionChanged) {
    return <main className="mx-auto max-w-xl space-y-4 p-6 text-foreground">
      <h1 className="text-xl font-bold">La cuenta cambió</h1>
      <p role="alert">Detuvimos el editor para evitar guardar tus cambios en otra cuenta. El contenido de esta pestaña permanece en memoria, pero no se está guardando.</p>
      <p>Al recargar se perderán los cambios sin guardar y los archivos que todavía no hayas publicado. Comprueba que has vuelto a la cuenta original antes de continuar.</p>
      <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => {
        if (window.confirm("¿Recargar el editor? Se perderán los cambios sin guardar y los archivos locales pendientes.")) {
          allowProfileReloadRef.current = true
          window.location.reload()
        }
      }}>Descartar cambios locales y recargar</button>
    </main>
  }

  if (loadFailed) {
    return <main className="mx-auto max-w-xl space-y-4 p-6 text-foreground">
      <h1 className="text-xl font-bold">No pudimos cargar tu contenido</h1>
      <p role="alert">El editor está detenido para proteger tu perfil. Revisa tu conexión y vuelve a cargarlo.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-4">Volver a cargar el editor</button>
      <button type="button" onClick={() => router.push("/perfil/dashboard")} className="block min-h-11 text-primary underline">Ir al panel</button>
    </main>
  }

  if (catalogComparison) {
    return <CatalogReconciliation draft={{ products, services }} published={catalogComparison}
      busy={catalogChoiceBusy} error={catalogChoiceError} onChoose={source => void chooseCatalog(source)}
      onDownloadDraft={() => void downloadDraftCopy()} />
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <EditorHeader
        blockCount={blocks.length}
        onPublish={handlePublish}
        onDownloadCopy={() => void downloadDraftCopy()}
        isPublishing={publishing}
        publicSlug={publicSlug}
        activeRole={activeRole}
        draftMessage={draftMessage}
        draftFailed={draftFailed}
        previewContent={{ blocks, products, services }}
        onBeforeNavigate={() => {
          if (publishingRef.current || draftWrites > 0) {
            showToast("Espera a que termine el guardado antes de salir del editor.", "error")
            return false
          }
          return !(draftPending || draftFailed || hasLocalFiles) || window.confirm("¿Salir del editor? Se perderán los cambios sin guardar y los archivos locales que todavía no hayas publicado.")
        }}
        switchingDisabled={draftWrites > 0 || (!draftFailed && draftPending)}
        onBeforeProfileReload={() => {
          allowProfileReloadRef.current = true
          return () => { allowProfileReloadRef.current = false }
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — block library. En mobile/tablet (< xl) es un overlay a
            pantalla completa que se abre desde el botón "Bloques" del
            header; desde xl comparte espacio con el lienzo como siempre. */}
        {mobileBlocksOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/70 xl:hidden"
            onClick={() => setMobileBlocksOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`glass-panel fixed inset-y-0 left-0 z-40 w-full max-w-xs flex-col border-r border-sidebar-border/60 xl:static xl:z-auto xl:flex xl:w-64 xl:max-w-none ${
            mobileBlocksOpen ? "flex" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-sidebar-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Bloques</h2>
            </div>
            <button
              type="button"
              onClick={() => setMobileBlocksOpen(false)}
              aria-label="Cerrar panel de bloques"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground xl:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <BlockLibrary
              onAdd={(type) => {
                addBlock(type)
                setMobileBlocksOpen(false)
              }}
              onDragStart={(type) => setDragPayload({ kind: "new", type })}
              onDragEnd={() => setDragPayload(null)}
              locked={activeRole === "editor"}
              disabledTypes={SINGLETON_BLOCK_TYPES.filter((type) => blocks.some((b) => b.type === type))}
            />
          </div>
        </aside>

        {/* Center — live preview canvas. Padding inferior extra en < xl para
            no quedar tapado por la barra de acciones fija de móvil. */}
        <main className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%)] p-4 pb-24 sm:p-6 sm:pb-24 lg:px-8 lg:pt-8 xl:pb-8">
          <PreviewCanvas
            blocks={blocks}
            selectedId={selectedId}
            isDragging={dragPayload !== null}
            onSelect={setSelectedId}
            onDelete={deleteBlock}
            onClearContent={clearBlockContent}
            onMove={moveBlock}
            onMoveTo={moveBlockToIndex}
            onDropAt={handleDropAt}
            onReorderStart={(index) => setDragPayload({ kind: "reorder", index })}
            onDragEnd={() => setDragPayload(null)}
            activeRole={activeRole}
            products={products}
            services={services}
            shareUrl={publicSlug ? `${window.location.origin}/${publicSlug}` : undefined}
            albumCovers={
              (blocks.find((b) => b.type === "tracks")?.data as TracksData | undefined)?.albums
                .map((a) => a.cover)
                .filter(Boolean) ?? []
            }
            creditsCount={(blocks.find((b) => b.type === "credits")?.data as CreditsData | undefined)?.credits.length ?? 0}
            onAlbumSelect={setFocusAlbumId}
          />
        </main>

        {/* Right — inspector. Siempre montado en desktop (xl+): no se cierra
            ni desaparece al seleccionar un bloque, muestra directamente el
            primero seleccionado al entrar. En mobile/tablet sigue siendo un
            overlay que se pisa tocando afuera, ya que ahí sí comparte
            pantalla con el lienzo. */}
        {selectedBlock && (
          <div
            className="fixed inset-0 z-30 bg-background/70 xl:hidden"
            onClick={() => setSelectedId(null)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`glass-panel fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-sidebar-border/60 xl:static xl:z-auto xl:flex xl:w-96 xl:max-w-none 2xl:w-[27rem] ${
            selectedBlock ? "flex" : "hidden xl:flex"
          }`}
        >
          <BlockInspector
            generateBanner={publishing ? undefined : generarBannerConIA}
            block={selectedBlock}
            onChange={updateBlock}
            onDelete={deleteBlock}
            onClearContent={clearBlockContent}
            blobRegistry={blobRegistryRef}
            products={products}
            onProductsChange={setProducts}
            services={services}
            onServicesChange={setServices}
            profileId={editorProfile.id}
            isBand={editorProfile.isBand}
            onClose={() => setSelectedId(null)}
            focusAlbumId={focusAlbumId}
          />
        </aside>
      </div>

      {/* Barra de acciones inferior — solo < xl. Estilo TikTok/Instagram: las
          dos acciones que más se necesitan a mano (agregar bloques y
          publicar) fijas abajo, donde el pulgar llega sin tener que ir hasta
          el header. En escritorio (xl+) no se renderiza: ahí "Bloques" ya es
          un panel estático y "Publicar" vive en el header, como siempre. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-sidebar-border bg-sidebar/95 px-4 py-2.5 backdrop-blur-md xl:hidden">
        <button
          type="button"
          onClick={() => setMobileBlocksOpen((v) => !v)}
          aria-pressed={mobileBlocksOpen}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-muted-foreground transition-colors active:text-foreground"
        >
          <Layers className="size-5" />
          <span className="text-[10px] font-medium">Bloques</span>
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing}
          className="flex-[2] rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? "Publicando..." : "Publicar"}
        </button>
      </nav>

      {showExitConfirm && (
        <dialog
          ref={exitDialogRef}
          aria-labelledby="editor-exit-title"
          aria-describedby="editor-exit-description"
          className="fixed inset-0 z-100 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/70"
          onCancel={event => {
            if (logoutLock.current) event.preventDefault()
            else setShowExitConfirm(false)
          }}
        >
          <div
            className="w-full p-6 shadow-2xl"
          >
            <h3 id="editor-exit-title" className="mb-2 text-lg font-semibold text-foreground">¿Salir del editor?</h3>
            <p id="editor-exit-description" className="mb-5 text-sm text-muted-foreground">
              Revisa el estado del guardado antes de salir. Los archivos locales todavía sin publicar
              se perderán al cerrar esta pestaña. También puedes usar "Volver al feed" desde el menú de arriba.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExitLogout}
                disabled={loggingOutFromEditor || publishing || draftWrites > 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="size-4" />
                {loggingOutFromEditor ? "Cerrando sesión..." : "Cerrar sesión y salir"}
              </button>
              <button
                type="button"
                ref={keepEditingRef}
                disabled={loggingOutFromEditor}
                onClick={() => setShowExitConfirm(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}

"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { type Block, type BlockType, type TracksData, type CreditsData, createBlock, dbBlockToBlock, defaultData, isKnownBlockType, mergePublicacionesEmbeds, PROFILE_ID, SINGLETON_BLOCK_TYPES } from "@/lib/blocks"
import { type CatalogProduct, type CatalogService, fetchCatalog, publishCatalog, normalizeDraftProduct, normalizeDraftService } from "@/lib/catalog"
import { type BandRole, getActiveBandId, setActiveBandId, getEffectiveBandRole } from "@/lib/bands"
import { EditorHeader } from "@/components/editor-header"
import { BlockLibrary } from "@/components/block-library"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BlockInspector, audioBitrateByFile } from "@/components/block-inspector"
import { Layers, LogOut, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { authedFetch } from "@/lib/authed-fetch"
import imageCompression from "browser-image-compression"
import { ensureCompressedAudio, DEFAULT_AUDIO_BITRATE, type AudioBitrate } from "@/lib/audio-transcode"
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
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!base) return new Set()
  const json = JSON.stringify(value ?? null)
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const matches = json.match(new RegExp(`${escapedBase}/[^"\\\\]+`, "g")) ?? []
  return new Set(matches)
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
 * corre siempre en uploadFileToStorage, invisible para el usuario — no hace
 * falta tocar nada en los uploaders individuales (avatar, banner, portadas,
 * pistas, merch, etc).
 */
async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.82,
    })
    return new File([compressed], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" })
  } catch (err) {
    // Si la compresión falla (ej. formato no soportado por el navegador),
    // se sube el archivo original en vez de bloquear la publicación.
    console.error("[compressImage] Error comprimiendo imagen, se sube el original:", err)
    return file
  }
}

/**
 * Sube un File a Cloudflare R2 (vía URL firmada, ver app/api/upload-url) y
 * devuelve la URL pública permanente. El archivo va directo del navegador a
 * R2 — este helper solo pide la URL firmada, no reenvía el archivo por
 * ningún servidor propio.
 */
async function uploadFileToStorage(file: File, folder: "images" | "audio"): Promise<string> {
  const uploadFile = folder === "images" ? await compressImage(file) : file
  const ext = (uploadFile.name.split(".").pop() ?? "bin").toLowerCase()
  const contentType =
    folder === "audio"
      ? AUDIO_MIME_TYPES[ext] ?? "audio/mpeg"
      : IMAGE_MIME_TYPES[ext] ?? uploadFile.type ?? "image/webp"

  const uploadBody =
    uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType })

  const presignRes = await authedFetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, extension: ext, contentType }),
  })
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}))
    throw new Error(body.error ?? "No se pudo iniciar la subida del archivo.")
  }
  const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: uploadBody,
  })
  if (!putRes.ok) throw new Error("No se pudo subir el archivo al almacenamiento.")

  return publicUrl
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
async function uploadBlobFile(url: string, blobRegistry: Map<string, File>): Promise<string> {
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
  const fileToUpload = folder === "audio" ? await ensureCompressedAudio(file, bitrate) : file
  return uploadFileToStorage(fileToUpload, folder)
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
  blobRegistry: Map<string, File>
): Promise<T> {
  const blobPaths = collectBlobPaths(item)
  if (blobPaths.length === 0) return item

  let updated: Record<string, unknown> = { ...item }
  for (const { path, url } of blobPaths) {
    const permanentUrl = await uploadBlobFile(url, blobRegistry)
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
  const [loading, setLoading] = useState(true)
  // Slug de la página pública ya publicada (deriva de profiles.display_name)
  // — solo existe una vez que el artista publicó al menos una vez.
  const [publicSlug, setPublicSlug] = useState("")
  // Rol efectivo del usuario sobre el perfil que se está editando ahora
  // mismo — "owner" para el perfil personal o una banda propia, "admin"/
  // "editor" para un miembro de banda. Controla qué puede tocar en el
  // lienzo (ver bloqueo de bloques más abajo).
  const [activeRole, setActiveRole] = useState<BandRole>("owner")
  // Aviso de salida al presionar "atrás" en el celular (ver efecto de
  // bloqueo de historial más abajo) — la única salida real desde ese gesto
  // es cerrar sesión; "Volver al feed" del header sigue funcionando normal
  // porque navega con un Link, no dispara "popstate".
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [loggingOutFromEditor, setLoggingOutFromEditor] = useState(false)

  /**
   * Registro de blob URLs → File real.
   * Cuando ImageUploader o AudioUploader crean una blob URL,
   * la registran aquí. handlePublish lo consulta al guardar.
   */
  const blobRegistryRef = useRef<Map<string, File>>(new Map())
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

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  useEffect(() => {
    async function loadSavedBlocks() {
      try {
        // profile_blocks/products/services están indexados por el id real de
        // la fila `profiles`. Se busca primero por el usuario autenticado y,
        // si no tiene perfil propio todavía, se usa el perfil semilla
        // PROFILE_ID como fallback — así cada cuenta guarda y recupera lo suyo.
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("user_id", user?.id ?? PROFILE_ID)
          .maybeSingle()

        if (profileError) throw profileError

        let profileId = profile?.id ?? PROFILE_ID
        let isBand = false
        let effectiveDisplayName = profile?.display_name ?? ""
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
            const { data: bandProfile } = bandRole
              ? await supabase.from("profiles").select("id, display_name").eq("id", selectedBandId).maybeSingle()
              : { data: null }

            if (bandRole && bandProfile) {
              profileId = bandProfile.id
              effectiveDisplayName = bandProfile.display_name ?? ""
              isBand = true
              role = bandRole
            } else {
              setActiveBandId(user.id, null)
            }
          }
        }

        profileIdRef.current = profileId
        isBandRef.current = isBand
        setActiveRole(role)

        // El link a compartir es el de la página pública real, no algo que
        // se pueda armar en el borrador — solo existe si el perfil ya tiene
        // un nombre publicado.
        if (effectiveDisplayName) {
          setPublicSlug(effectiveDisplayName.trim().toLowerCase().replaceAll(" ", "-"))
        } else {
          setPublicSlug("")
        }

        // El borrador se consulta en una llamada aparte: si falla (ej. la
        // migración de draft_content todavía no corrió en Supabase) no debe
        // tumbar la carga de lo ya publicado — solo se ignora el borrador.
        let draft: { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] } | null = null
        if (profile || isBand) {
          const { data: draftRow, error: draftError } = await supabase
            .from("profiles")
            .select("draft_content")
            .eq("id", profileId)
            .maybeSingle()
          if (draftError) {
            console.error("No se pudo leer el borrador (¿falta la migración draft_content?):", draftError)
          } else {
            draft = draftRow?.draft_content ?? null
          }
        }

        if (draft) {
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
          setBlocks(loadedBlocks)
          setSelectedId(defaultSelectedId(loadedBlocks))

          const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profileId)
          setProducts(catalogProducts)
          setServices(catalogServices)
        }
      } catch (err) {
        console.error("Error cargando bloques iniciales:", err)
        const fallbackBlocks = [createBlock("hero"), createBlock("tracks"), createBlock("merch")]
        setBlocks(fallbackBlocks)
        setSelectedId(defaultSelectedId(fallbackBlocks))
      } finally {
        setLoading(false)
      }
    }
    loadSavedBlocks()
  }, [])

  // Autoguardado de borrador: cada cambio se sube a profiles.draft_content
  // (columna aparte, nunca leída por el perfil público). No toca
  // profile_blocks/products/services — esas tablas son lo que ya está
  // publicado y solo cambian cuando se presiona Publish.
  useEffect(() => {
    if (loading || publishing) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    const profileId = profileIdRef.current
    if (!profileId) return

    const timeout = setTimeout(async () => {
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
      const { error } = await supabase
        .from("profiles")
        .update({ draft_content: { blocks: sanitizedBlocks, products: sanitizedProducts, services: sanitizedServices } })
        .eq("id", profileId)
      if (error) console.error("[autosave] Error guardando borrador:", error)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [blocks, products, services, loading, publishing])

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
    setLoggingOutFromEditor(true)
    await supabase.auth.signOut()
    // Navegación dura (no router.push): así se sale de verdad de la trampa
    // de historial de arriba en vez de quedar atrapado en el mismo ciclo.
    window.location.href = "/"
  }

  // ── Generación de banner con IA ──────────────────────────────────────
  async function generarBannerConIA(promptTexto: string) {
    try {
      const res = await authedFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptTexto }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error en la IA")
      return data.url
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(err)
      alert("Error al generar la imagen con IA: " + message)
      return null
    }
  }

  // ── Publicación con subida inteligente de archivos ────────────────────
  async function handlePublish() {
    setPublishing(true)
    try {
      // 1. Clonar bloques para trabajar sin mutar el estado de React
      let publishBlocks: Block[] = JSON.parse(JSON.stringify(blocks))

      // 2. Escanear bloques, productos y servicios buscando blob URLs y
      // subirlas a Storage antes de publicar.
      publishBlocks = await Promise.all(
        publishBlocks.map(async (block) => {
          const updatedData = await resolveEntityBlobs(block.data as Record<string, unknown>, blobRegistryRef.current)
          // Refleja la URL permanente en el estado de React para que la
          // vista previa deje de apuntar a una blob URL en cuanto termina.
          setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, data: updatedData as Block["data"] } : b)))
          return { ...block, data: updatedData as Block["data"] }
        })
      )

      const publishProducts: CatalogProduct[] = await Promise.all(
        products.map(
          async (p) =>
            (await resolveEntityBlobs(p as unknown as Record<string, unknown>, blobRegistryRef.current)) as unknown as CatalogProduct
        )
      )
      setProducts(publishProducts)

      const publishServices: CatalogService[] = await Promise.all(
        services.map(
          async (s) =>
            (await resolveEntityBlobs(s as unknown as Record<string, unknown>, blobRegistryRef.current)) as unknown as CatalogService
        )
      )
      setServices(publishServices)

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

        // No pisar el nombre/bio reales: si el perfil ya existe, se conservan
        // tal cual. Solo en la primera publicación (perfil nuevo) se usa un
        // valor derivado de la cuenta autenticada, nunca uno inventado.
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("display_name, bio")
          .eq("user_id", user?.id ?? PROFILE_ID)
          .maybeSingle()

        const fallbackName =
          user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || ""

        const profilePayload = {
          user_id: user?.id ?? PROFILE_ID,
          display_name: existingProfile?.display_name || fallbackName,
          bio: existingProfile?.bio || "",
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "user_id" })
          .select("id")
          .single()

        if (profileError) throw profileError

        profileId = profile.id
      }

      // 3.5. Antes de sobrescribir lo publicado, guardar qué URLs de R2 usa
      // TODAVÍA (para poder borrar después las que este publish deja
      // huérfanas, ej. una pista o imagen reemplazada). Si esta lectura
      // falla, no debe tumbar la publicación — simplemente no se limpia R2
      // este ciclo, el archivo viejo queda para el próximo publish exitoso.
      let oldR2Urls = new Set<string>()
      try {
        const [{ data: oldBlocksRows }, { products: oldProducts, services: oldServices }] = await Promise.all([
          supabase.from("profile_blocks").select("content").eq("profile_id", profileId),
          fetchCatalog(profileId),
        ])
        oldR2Urls = new Set([
          ...extractR2Urls(oldBlocksRows),
          ...extractR2Urls(oldProducts),
          ...extractR2Urls(oldServices),
        ])
      } catch (err) {
        console.error("[handlePublish] No se pudo leer el estado previo para limpiar R2:", err)
      }

      // 4. Eliminar bloques anteriores y reinsertar los actualizados
      const { error: deleteError } = await supabase
        .from("profile_blocks")
        .delete()
        .eq("profile_id", profileId)

      if (deleteError) throw deleteError

      const profileBlocksPayload = publishBlocks.map((b, index) => ({
        profile_id: profileId,
        block_type: b.type,
        position_index: index,
        content: b.data,
        is_visible: true,
      }))

      const { error: blocksError } = await supabase
        .from("profile_blocks")
        .insert(profileBlocksPayload)

      if (blocksError) throw blocksError

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
              try {
                await recordAuthorCertificate(profileId, {
                  songTitle: track.title || "Sin título",
                  fileHash: track.fileHash,
                })
              } catch (err) {
                logSupabaseError("handlePublish: no se pudo registrar el certificado de autoría", err)
              }
            }
          }
        }
      }

      // 5. Publicar catálogo de productos y servicios
      await publishCatalog(profileId, publishProducts, publishServices)

      // 5.5. Borrar de R2 los archivos que quedaron huérfanos: estaban en lo
      // publicado anteriormente (oldR2Urls) pero ya nada de este publish los
      // referencia — típicamente porque el usuario reemplazó una pista o una
      // imagen por otra. Best-effort y en segundo plano: si falla, el
      // archivo viejo simplemente queda en R2 hasta que un próximo publish
      // lo vuelva a detectar como huérfano; nunca debe tumbar la publicación
      // en sí, que ya terminó con éxito en este punto.
      const newR2Urls = new Set([
        ...extractR2Urls(publishBlocks),
        ...extractR2Urls(publishProducts),
        ...extractR2Urls(publishServices),
      ])
      const orphanedR2Urls = [...oldR2Urls].filter((url) => !newR2Urls.has(url))
      if (orphanedR2Urls.length > 0) {
        authedFetch("/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: orphanedR2Urls }),
        }).catch((err) => console.error("[handlePublish] No se pudieron borrar archivos huérfanos de R2:", err))
      }

      // Recién acá es seguro liberar el registro de blobs: todo lo que
      // apuntaba a blob: ya se subió y el estado ya quedó con las URLs
      // permanentes (ver los setBlocks/setProducts/setServices de arriba),
      // así que ninguna blob URL sigue en uso.
      for (const url of blobRegistryRef.current.keys()) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url)
      }
      blobRegistryRef.current.clear()

      // Ya está publicado: se limpia el borrador para no recargarlo la
      // próxima vez que se abra el editor. Si esta llamada falla (ej. una red
      // inestable en móvil justo después de subir fotos) y queda un borrador
      // viejo en la base, la próxima vez que se monte el editor (por ejemplo
      // al volver del feed) esa fila vieja pisaría lo recién publicado —de
      // ahí las fotos "desaparecidas". Por eso se reintenta antes de rendirse.
      skipNextAutosaveRef.current = true
      let clearDraftError: { message: string } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase
          .from("profiles")
          .update({ draft_content: null })
          .eq("id", profileId)
        clearDraftError = error
        if (!error) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (clearDraftError) {
        console.error("[handlePublish] Error limpiando borrador tras 3 intentos:", clearDraftError)
        showToast(
          "Se publicaron tus cambios, pero no se pudo limpiar el borrador. Si al volver ves contenido antiguo, vuelve a publicar.",
          "error"
        )
        return
      }

      showToast("¡Cambios publicados con éxito en tu perfil!", "success")
    } catch (err: unknown) {
      // Los errores de Supabase son PostgrestError, no Error estándar de JS.
      // String(postgrestError) devuelve "[object Object]" — usamos JSON.stringify.
      let message: string
      if (err instanceof Error) {
        message = err.message
      } else if (err && typeof err === "object" && "message" in err) {
        const pgErr = err as { message: string; code?: string; details?: string; hint?: string }
        message = pgErr.message
        if (pgErr.code) message += ` (código: ${pgErr.code})`
        if (pgErr.hint) message += ` — ${pgErr.hint}`
      } else {
        message = JSON.stringify(err)
      }
      console.error("[handlePublish] Error:", err)
      showToast("Ocurrió un error al publicar: " + message, "error")
    } finally {
      setPublishing(false)
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

  function updateBlock(id: string, data: Block["data"]) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...data } } : b)))
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <EditorHeader
        blockCount={blocks.length}
        onPublish={handlePublish}
        isPublishing={publishing}
        publicSlug={publicSlug}
        activeRole={activeRole}
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
            block={selectedBlock}
            onChange={updateBlock}
            onDelete={deleteBlock}
            onClearContent={clearBlockContent}
            blobRegistry={blobRegistryRef}
            products={products}
            onProductsChange={setProducts}
            services={services}
            onServicesChange={setServices}
            profileId={profileIdRef.current}
            isBand={isBandRef.current}
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
        <div
          className="fixed inset-0 z-100 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-foreground">¿Salir del editor?</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              Tu progreso se guarda solo. Para salir del editor con el botón atrás, primero cierra sesión — o usa
              "Volver al feed" desde el menú de arriba.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExitLogout}
                disabled={loggingOutFromEditor}
                className="flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="size-4" />
                {loggingOutFromEditor ? "Cerrando sesión..." : "Cerrar sesión y salir"}
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

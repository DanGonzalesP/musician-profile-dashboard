"use client"

import { useState, useEffect, useRef } from "react"
import { type Block, type BlockType, createBlock, dbBlockToBlock, PROFILE_ID } from "@/lib/blocks"
import { type CatalogProduct, type CatalogService, fetchCatalog, publishCatalog } from "@/lib/catalog"
import { EditorHeader } from "@/components/editor-header"
import { BlockLibrary } from "@/components/block-library"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BlockInspector } from "@/components/block-inspector"
import { Layers } from "lucide-react"
import { supabase } from "@/lib/supabase"
import imageCompression from "browser-image-compression"
import { ProfileSkeleton } from "@/components/blocks/skeletons"

type DragPayload = { kind: "new"; type: BlockType } | { kind: "reorder"; index: number } | null

// ─── Helpers para escanear y reemplazar blob URLs ─────────────────────────

/**
 * Dado un bloque, devuelve todos los strings que son blob URLs
 * junto con la ruta de la propiedad que los contiene.
 */
function collectBlobPaths(data: Record<string, unknown>, prefix = ""): { path: string; url: string }[] {
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

// Algunos navegadores detectan mal el MIME type de ciertos archivos de audio
// (ej. reportan .mp3/.mpeg como "video/mpeg"), lo que el bucket de Supabase
// rechaza. Para la carpeta "audio" NUNCA confiamos en la detección del
// navegador (file.type): siempre se fuerza un tipo audio/* válido.
const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpg: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
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
 * Sube un File a Supabase Storage y devuelve la URL pública permanente.
 */
async function uploadFileToStorage(file: File, folder: "images" | "audio"): Promise<string> {
  const uploadFile = folder === "images" ? await compressImage(file) : file
  const ext = (uploadFile.name.split(".").pop() ?? "bin").toLowerCase()
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const contentType =
    folder === "audio"
      ? AUDIO_MIME_TYPES[ext] ?? "audio/mpeg"
      : IMAGE_MIME_TYPES[ext] ?? uploadFile.type ?? "image/webp"

  // El SDK de Supabase sube los File/Blob envueltos en FormData, donde el
  // navegador usa el `.type` propio del objeto — la opción `contentType` del
  // SDK se ignora en ese caso. Por eso reconstruimos el archivo con el tipo
  // correcto ya asignado, en vez de confiar en esa opción.
  const uploadBody =
    uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType })

  const { error: uploadError } = await supabase.storage.from("assets").upload(fileName, uploadBody, {
    upsert: false,
    contentType,
  })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from("assets").getPublicUrl(fileName)
  if (!data?.publicUrl) throw new Error("No se pudo obtener la URL pública del archivo subido.")

  return data.publicUrl
}

// ─────────────────────────────────────────────────────────────────────────

export function ProfileEditor() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [services, setServices] = useState<CatalogService[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload>(null)
  const [publishing, setPublishing] = useState(false)
  const [loading, setLoading] = useState(true)

  /**
   * Registro de blob URLs → File real.
   * Cuando ImageUploader o AudioUploader crean una blob URL,
   * la registran aquí. handlePublish lo consulta al guardar.
   */
  const blobRegistryRef = useRef<Map<string, File>>(new Map())
  // Id de perfil resuelto en la carga — el autoguardado de borrador lo reutiliza
  // para no repetir la consulta de auth en cada cambio.
  const profileIdRef = useRef<string | null>(null)
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
          .select("id")
          .eq("user_id", user?.id ?? PROFILE_ID)
          .maybeSingle()

        if (profileError) throw profileError

        const profileId = profile?.id ?? PROFILE_ID
        profileIdRef.current = profileId

        // El borrador se consulta en una llamada aparte: si falla (ej. la
        // migración de draft_content todavía no corrió en Supabase) no debe
        // tumbar la carga de lo ya publicado — solo se ignora el borrador.
        let draft: { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] } | null = null
        if (profile) {
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
          setBlocks(draft.blocks ?? [])
          setProducts(draft.products ?? [])
          setServices(draft.services ?? [])
        } else {
          const { data: dbBlocks, error } = await supabase
            .from("profile_blocks")
            .select("id, block_type, content, position_index")
            .eq("profile_id", profileId)
            .order("position_index", { ascending: true })

          if (error) throw error

          if (dbBlocks && dbBlocks.length > 0) {
            setBlocks(dbBlocks.map(dbBlockToBlock))
          } else {
            setBlocks([
              createBlock("hero"),
              createBlock("tracks"),
              createBlock("merch"),
            ])
          }

          const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profileId)
          setProducts(catalogProducts)
          setServices(catalogServices)
        }
      } catch (err) {
        console.error("Error cargando bloques iniciales:", err)
        setBlocks([
          createBlock("hero"),
          createBlock("tracks"),
          createBlock("merch"),
        ])
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
      const { error } = await supabase
        .from("profiles")
        .update({ draft_content: { blocks, products, services } })
        .eq("id", profileId)
      if (error) console.error("[autosave] Error guardando borrador:", error)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [blocks, products, services, loading, publishing])

  // ── Generación de banner con IA ──────────────────────────────────────
  async function generarBannerConIA(promptTexto: string) {
    try {
      const res = await fetch("/api/generate-image", {
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

      // 2. Escanear cada bloque buscando blob URLs y subirlas a Storage
      const uploadPromises: Promise<void>[] = []

      publishBlocks = await Promise.all(
        publishBlocks.map(async (block) => {
          const data = block.data as Record<string, unknown>
          const blobPaths = collectBlobPaths(data)

          if (blobPaths.length === 0) return block

          let updatedData = { ...data }

          for (const { path, url } of blobPaths) {
            const file = blobRegistryRef.current.get(url)
            if (!file) {
              console.warn(`[handlePublish] No se encontró el File para blob URL: ${url}`)
              continue
            }

            // Determinar carpeta por tipo MIME
            const folder: "images" | "audio" = file.type.startsWith("audio") ? "audio" : "images"

            try {
              const permanentUrl = await uploadFileToStorage(file, folder)
              updatedData = setDeep(updatedData, path, permanentUrl) as Record<string, unknown>

              // Limpiar la blob URL del navegador
              URL.revokeObjectURL(url)
              blobRegistryRef.current.delete(url)

              // Actualizar el estado de React con la URL permanente
              // para que la vista previa muestre la URL definitiva
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === block.id
                    ? { ...b, data: setDeep(b.data as Record<string, unknown>, path, permanentUrl) as Block["data"] }
                    : b
                )
              )
            } catch (uploadErr) {
              console.error(`[handlePublish] Error subiendo archivo en ${path}:`, uploadErr)
              throw uploadErr
            }
          }

          return { ...block, data: updatedData as Block["data"] }
        })
      )

      // 3. Upsert del perfil — atado al usuario autenticado, con PROFILE_ID
      // como fallback, para que cada cuenta publique y recupere lo suyo.
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

      const profileId = profile.id

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

      // 5. Publicar catálogo de productos y servicios
      await publishCatalog(profileId, products, services)

      // Ya está publicado: se limpia el borrador para no recargarlo la
      // próxima vez que se abra el editor.
      skipNextAutosaveRef.current = true
      const { error: clearDraftError } = await supabase
        .from("profiles")
        .update({ draft_content: null })
        .eq("id", profileId)
      if (clearDraftError) console.error("[handlePublish] Error limpiando borrador:", clearDraftError)

      alert("¡Cambios publicados con éxito en tu perfil!")
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
      alert("Ocurrido un error al publicar:\n" + message)
    } finally {
      setPublishing(false)
    }
  }

  // ── Gestión de bloques ────────────────────────────────────────────────

  function addBlock(type: BlockType) {
    const block = createBlock(type)
    setBlocks((prev) => [...prev, block])
    setSelectedId(block.id)
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
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
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-64 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 sm:flex sm:w-72 lg:w-80">
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
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — block library */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:w-72 lg:w-80">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-3">
            <Layers className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Blocks</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Drag a block onto your profile, or press the plus button to append it.
            </p>
            <BlockLibrary
              onAdd={addBlock}
              onDragStart={(type) => setDragPayload({ kind: "new", type })}
              onDragEnd={() => setDragPayload(null)}
            />
          </div>
        </aside>

        {/* Center — live preview canvas */}
        <main className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto mb-5 flex max-w-2xl items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Live Preview</h1>
              <p className="text-xs text-muted-foreground">This is how fans will see your page.</p>
            </div>
          </div>
          <PreviewCanvas
            blocks={blocks}
            selectedId={selectedId}
            isDragging={dragPayload !== null}
            onSelect={setSelectedId}
            onDelete={deleteBlock}
            onMove={moveBlock}
            onDropAt={handleDropAt}
            onReorderStart={(index) => setDragPayload({ kind: "reorder", index })}
            onDragEnd={() => setDragPayload(null)}
            products={products}
            services={services}
          />
        </main>

        {/* Right — inspector */}
        {selectedBlock && (
          <>
            <div
              className="fixed inset-0 z-30 bg-background/70 xl:hidden"
              onClick={() => setSelectedId(null)}
              aria-hidden="true"
            />
            <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-sidebar-border bg-sidebar xl:static xl:z-auto xl:w-80 xl:max-w-none">
              <BlockInspector
                block={selectedBlock}
                onChange={updateBlock}
                onClose={() => setSelectedId(null)}
                onDelete={deleteBlock}
                blobRegistry={blobRegistryRef}
                products={products}
                onProductsChange={setProducts}
                services={services}
                onServicesChange={setServices}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}

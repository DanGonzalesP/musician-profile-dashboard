"use client"

// Editor de encuadre de imagen. Se abre al tocar una imagen ya subida en el
// panel de edición: permite mover (arrastrar) y hacer zoom para acomodar qué
// parte de la foto se ve. Al confirmar, RECORTA la imagen a un nuevo archivo
// (canvas → blob) — así el resto de la app sigue tratando cada imagen como una
// simple URL, sin metadatos de encuadre por bloque.
//
// El encuadre parte de un "cover" (la imagen llena el marco) con zoom 1; el
// usuario solo puede acercar (zoom ≥ 1) y desplazar dentro de los límites, de
// modo que el marco nunca queda con bordes vacíos.

import { useEffect, useId, useRef, useState } from "react"
import { Loader2, Move, X, ZoomIn } from "lucide-react"

type Point = { x: number; y: number }

const FRAME_WIDTH = 240 // Cabe también en una ventana de 320 px.

type ImageAdjustProps = {
  src: string
  aspect?: number
  onCancel: () => void
  onConfirm: (blobUrl: string, file: File) => void
}

export function ImageAdjustModal(props: ImageAdjustProps) {
  return <ImageAdjustSession key={JSON.stringify([props.src, props.aspect])} {...props} />
}

function ImageAdjustSession({
  src,
  aspect = 1,
  onCancel,
  onConfirm,
}: ImageAdjustProps) {
  const frameW = FRAME_WIDTH
  const frameH = Math.round(FRAME_WIDTH / (Number.isFinite(aspect) && aspect > 0 ? aspect : 1))

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [position, setOffset] = useState<Point | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closed = useRef(false)
  const busy = useRef(false)
  const titleId = useId()
  const helpId = useId()

  useEffect(() => {
    closed.current = false
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { closed.current = true; dialog?.close() }
  }, [])

  const cancel = () => {
    if (closed.current) return
    closed.current = true
    onCancel()
  }

  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  // Las URLs remotas (http/https, ej. una portada ya publicada en R2) se
  // piden a través de nuestro propio proxy same-origin — así el <canvas>
  // nunca las ve como cross-origin y no depende de que el bucket de R2 tenga
  // CORS abierto para el dominio actual (ver app/api/image-proxy). Ese CORS
  // faltante era justo lo que hacía fallar el recorte ("No se pudo cargar la
  // imagen para editarla"). Los blob:/data: (foto recién subida, aún sin
  // publicar) ya son same-origin y se cargan directo.
  const loadSrc = /^https?:\/\//.test(src)
    ? `/api/image-proxy?url=${encodeURIComponent(src)}`
    : src

  // Carga la imagen para conocer sus dimensiones naturales. crossOrigin para
  // poder exportarla del canvas sin "tainted".
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      if (!img.naturalWidth || !img.naturalHeight) { setLoadError(true); return }
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => { if (!cancelled) setLoadError(true) }
    img.src = loadSrc
    return () => { cancelled = true; img.onload = null; img.onerror = null; imgRef.current = null }
  }, [loadSrc])

  // Tamaño "cover" (la imagen justo llena el marco) a zoom 1.
  const cover = natural
    ? (() => {
        const scale = Math.max(frameW / natural.w, frameH / natural.h)
        return { w: natural.w * scale, h: natural.h * scale }
      })()
    : null

  const dispW = cover ? cover.w * zoom : 0
  const dispH = cover ? cover.h * zoom : 0

  // Mantiene el desplazamiento dentro de límites (sin bordes vacíos).
  const clampOffset = (o: Point): Point => {
    const maxX = 0
    const minX = frameW - dispW
    const maxY = 0
    const minY = frameH - dispH
    return {
      x: Math.min(maxX, Math.max(minX, o.x)),
      y: Math.min(maxY, Math.max(minY, o.y)),
    }
  }

  const offset = clampOffset(position ?? { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 })

  const changeZoom = (next: number) => {
    const factor = next / zoom
    setOffset({ x: frameW / 2 - (frameW / 2 - offset.x) * factor,
      y: frameH / 2 - (frameH / 2 - offset.y) * factor })
    setZoom(next)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (saving || !cover) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (saving) return
    const d = dragState.current
    if (!d) return
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img || !cover || !natural || busy.current || closed.current) return
    busy.current = true
    setSaveError("")
    setSaving(true)
    let blobUrl: string | null = null
    try {
      // px naturales por px de pantalla en el estado actual.
      const ratio = natural.w / dispW
      const sx = (0 - offset.x) * ratio
      const sy = (0 - offset.y) * ratio
      const sW = frameW * ratio
      const sH = frameH * ratio

      // Resolución de salida: la del recorte a tamaño natural, con un techo
      // razonable para no generar archivos enormes.
      const MAX_OUT = 1600
      const outScale = Math.min(1, MAX_OUT / Math.max(sW, sH))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(sW * outScale))
      canvas.height = Math.max(1, Math.round(sH * outScale))
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("sin contexto 2d")
      ctx.drawImage(img, sx, sy, sW, sH, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
      )
      if (!blob) throw new Error("no se pudo exportar la imagen")
      if (closed.current) return
      // Se pasa el File directo (ya lo tenemos en memoria acá) en vez de que
      // el que llama haga fetch(blobUrl) para reconstruirlo — ese round-trip
      // era innecesario y, si fallaba por lo que sea, dejaba el registro de
      // blobs desincronizado del estado (bug real: "no se encontró el
      // archivo" al publicar justo después de recortar una imagen).
      const file = new File([blob], "recorte.jpg", { type: blob.type || "image/jpeg" })
      blobUrl = URL.createObjectURL(blob)
      onConfirm(blobUrl, file)
      closed.current = true
    } catch {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      if (!closed.current) setSaveError("No pudimos aplicar el recorte. Tu imagen original sigue intacta. Puedes reintentar o cancelar.")
    } finally {
      busy.current = false
      if (!closed.current) setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel() }}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/70"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) cancel()
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Move className="size-4 text-primary" /> Acomodar imagen
          </h3>
          <button
            type="button"
            onClick={cancel}
            autoFocus
            aria-label="Cerrar"
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p id={helpId} className="mb-3 text-xs text-muted-foreground">
          Arrastra para mover o usa los controles de posición y zoom. Con el teclado, enfoca cada control y usa las flechas.
        </p>
        {saveError && <p role="alert" className="mb-3 text-sm text-destructive">{saveError}</p>}
        {loadError ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
            No se pudo cargar la imagen para editarla. Puede que el servidor no permita recortarla; probá volver a subirla.
          </p>
        ) : (
          <>

            <div className="flex justify-center">
              <div
                className="relative touch-none overflow-hidden rounded-xl border border-border bg-muted"
                style={{ width: frameW, height: frameH }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onLostPointerCapture={() => { dragState.current = null }}
              >
                {cover ? (
                  <img
                    src={loadSrc}
                    alt="Ajustar encuadre"
                    draggable={false}
                    className="absolute max-w-none cursor-grab select-none active:cursor-grabbing"
                    style={{
                      width: dispW,
                      height: dispH,
                      left: offset.x,
                      top: offset.y,
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => changeZoom(Number(e.target.value))}
                disabled={!cover || saving}
                className="min-h-11 w-full cursor-pointer accent-primary"
                aria-label="Zoom"
                aria-valuetext={`${Math.round(zoom * 100)} por ciento`}
              />
            </div>

            {(["x", "y"] as const).map(axis => {
              const extent = Math.max(0, axis === "x" ? dispW - frameW : dispH - frameH)
              return (
                <label key={axis} className="mt-2 block text-xs text-muted-foreground">
                  {axis === "x" ? "Posición horizontal" : "Posición vertical"}
                  <input type="range" min={0} max={100} step={1}
                    value={extent ? Math.round(-offset[axis] / extent * 100) : 50}
                    disabled={!cover || saving || extent < 0.01}
                    onChange={event => setOffset({ ...offset, [axis]: -Number(event.target.value) / 100 * extent })}
                    className="min-h-11 w-full accent-primary" />
                </label>
              )
            })}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || !cover}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Guardando…" : "Aplicar"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

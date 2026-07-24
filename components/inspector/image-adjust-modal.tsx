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

import { useEffect, useRef, useState } from "react"
import { Loader2, Move, X, ZoomIn } from "lucide-react"

type Point = { x: number; y: number }

const FRAME_WIDTH = 300 // px del marco en pantalla (el alto sale del aspect)

export function ImageAdjustModal({
  src,
  aspect = 1,
  onCancel,
  onConfirm,
}: {
  src: string
  /** ancho/alto del marco de recorte. 1 = cuadrado, 16/9 apaisado, 3/4 vertical. */
  aspect?: number
  onCancel: () => void
  onConfirm: (blobUrl: string, file: File) => void
}) {
  const frameW = FRAME_WIDTH
  const frameH = Math.round(FRAME_WIDTH / aspect)

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

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
    setLoadError(false)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => setLoadError(true)
    img.src = loadSrc
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

  // Re-centra al cargar y cada vez que cambia el zoom.
  useEffect(() => {
    if (!cover) return
    setOffset((o) => {
      // Al cambiar el zoom, mantené el centro del marco.
      const centered = { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 }
      const base = o.x === 0 && o.y === 0 ? centered : o
      return clampOffset(base)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover?.w, cover?.h, zoom])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current
    if (!d) return
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img || !cover || !natural) return
    setSaving(true)
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
      // Se pasa el File directo (ya lo tenemos en memoria acá) en vez de que
      // el que llama haga fetch(blobUrl) para reconstruirlo — ese round-trip
      // era innecesario y, si fallaba por lo que sea, dejaba el registro de
      // blobs desincronizado del estado (bug real: "no se encontró el
      // archivo" al publicar justo después de recortar una imagen).
      const file = new File([blob], "recorte.jpg", { type: blob.type || "image/jpeg" })
      onConfirm(URL.createObjectURL(blob), file)
    } catch (err) {
      console.error("[ImageAdjustModal] Error al recortar:", err)
      // Fallback: sin recorte, se conserva la imagen original.
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Move className="size-4 text-primary" /> Acomodar imagen
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
            No se pudo cargar la imagen para editarla. Puede que el servidor no permita recortarla; probá volver a subirla.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Arrastrá para mover y usá el zoom para elegir qué parte se ve.
            </p>

            <div className="flex justify-center">
              <div
                className="relative touch-none overflow-hidden rounded-xl border border-border bg-muted"
                style={{ width: frameW, height: frameH }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
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
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
                aria-label="Zoom"
              />
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || !cover}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Guardando…" : "Aplicar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

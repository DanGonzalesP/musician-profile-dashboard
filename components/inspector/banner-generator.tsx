"use client"

import { useEffect, useId, useRef, useState } from "react"
import Image from "next/image"

export type GenerateBanner = (prompt: string, signal: AbortSignal) => Promise<File>

export function BannerGenerator({ generate, apply }: { generate: GenerateBanner; apply: (file: File) => void }) {
  const id = useId()
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  const previewUrl = useRef<string | null>(null)

  useEffect(() => () => {
    request.current?.abort()
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  async function create() {
    if (request.current || !prompt.trim()) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError("")
    try {
      const file = await generate(prompt.trim(), controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(file)
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = url
      setPreview({ file, url })
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos generar el banner.")
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function cancel() {
    request.current?.abort()
    request.current = null
    setBusy(false)
    setError("Generación cancelada. Si el proveedor ya la recibió, podría haberla procesado.")
  }

  return (
    <details className="rounded-lg border border-border p-3 text-xs">
      <summary className="cursor-pointer font-medium">Crear un banner con IA</summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted-foreground">Tu descripción se envía a Together AI. Evita datos personales. Revisa el resultado y sus derechos antes de usarlo. Disponible solo si el servicio está habilitado.</p>
        <label htmlFor={id} className="block font-medium">Describe tu banner</label>
        <textarea id={id} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={600} rows={3} disabled={busy}
          className="w-full rounded-md border border-input bg-background p-2" placeholder="Un escenario nocturno con luces violetas, sin texto" />
        <div className="flex gap-2">
          <button type="button" onClick={() => void create()} disabled={busy || !prompt.trim()} className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">
            {busy ? "Generando…" : "Generar vista previa"}
          </button>
          {busy && <button type="button" onClick={cancel} className="rounded-md border border-border px-3 py-2">Cancelar</button>}
        </div>
        <p role="status" aria-live="polite">{busy ? "Preparando la imagen. Tu banner actual no cambia." : error}</p>
        {preview && <div className="space-y-2">
          <Image src={preview.url} unoptimized width={1024} height={1024} alt="Vista previa del banner generado" className="aspect-video w-full rounded-md object-cover" />
          <button type="button" disabled={busy} onClick={() => {
            apply(preview.file)
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
            previewUrl.current = null
            setPreview(null)
            setError("Banner añadido al editor. Puedes acomodarlo; se subirá cuando publiques.")
          }} className="rounded-md border border-border px-3 py-2 disabled:opacity-50">Usar este banner</button>
        </div>}
      </div>
    </details>
  )
}

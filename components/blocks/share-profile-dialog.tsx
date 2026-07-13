"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { X, Copy, Check, Download, MapPin, Image as ImageIcon } from "lucide-react"
import type { HeroData } from "@/lib/blocks"
import { socialIcons } from "./hero-block"

type ImageCandidate = {
  key: string
  label: string
  url?: string
}

function useQrCandidates(data: HeroData, albumCovers: string[]): ImageCandidate[] {
  const candidates: ImageCandidate[] = [{ key: "none", label: "Sin imagen" }]
  if (data.image) candidates.push({ key: "avatar", label: "Foto de perfil", url: data.image })
  if (data.banner) candidates.push({ key: "banner", label: "Banner", url: data.banner })
  albumCovers.forEach((url, i) => {
    if (url) candidates.push({ key: `album-${i}`, label: `Portada ${i + 1}`, url })
  })
  return candidates
}

export function ShareProfileDialog({
  shareUrl,
  data,
  albumCovers,
  onClose,
}: {
  shareUrl: string
  data: HeroData
  albumCovers: string[]
  onClose: () => void
}) {
  const candidates = useQrCandidates(data, albumCovers)
  const [selectedKey, setSelectedKey] = useState(candidates[1]?.key ?? "none")
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const selectedImageUrl = candidates.find((c) => c.key === selectedKey)?.url

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    QRCode.toCanvas(canvas, shareUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 288,
      color: { dark: "#000000ff", light: "#ffffffff" },
    })
      .then(() => {
        if (cancelled || !selectedImageUrl) return

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          if (cancelled) return
          const ctx = canvas.getContext("2d")
          if (!ctx) return
          const size = canvas.width * 0.24
          const x = (canvas.width - size) / 2
          const y = (canvas.height - size) / 2

          // Placa blanca detrás del logo para no degradar el contraste del QR
          ctx.save()
          ctx.beginPath()
          ctx.arc(canvas.width / 2, canvas.height / 2, size / 2 + 6, 0, Math.PI * 2)
          ctx.fillStyle = "#ffffff"
          ctx.fill()
          ctx.restore()

          ctx.save()
          ctx.beginPath()
          ctx.arc(canvas.width / 2, canvas.height / 2, size / 2, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(img, x, y, size, size)
          ctx.restore()
        }
        // Si la imagen no carga (ej. CORS bloqueado por el proveedor), se deja el QR limpio sin logo.
        img.onerror = () => {}
        img.src = selectedImageUrl
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [shareUrl, selectedImageUrl])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Si el navegador bloquea el acceso al portapapeles, el link ya está
      // visible en el input de solo lectura para copiarlo manualmente.
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `${(data.name || "perfil").toLowerCase().replace(/\s+/g, "-")}-qr.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  const socials = data.socials || []

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Compartir perfil</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* QR */}
        <div className="flex justify-center rounded-xl bg-white p-4">
          <canvas ref={canvasRef} className="size-72 max-w-full" />
        </div>

        {/* Selector de imagen para el centro del QR */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="size-3.5" /> Imagen dentro del QR
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {candidates.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedKey(c.key)}
                className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-md p-1 transition-colors ${
                  selectedKey === c.key ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent/50"
                }`}
              >
                <span className="flex size-10 w-full items-center justify-center overflow-hidden rounded bg-muted">
                  {c.url ? (
                    <img src={c.url} alt="" className="size-full object-cover" />
                  ) : (
                    <X className="size-4 text-muted-foreground/40" />
                  )}
                </span>
                <span className="w-full truncate text-center text-[9px] text-muted-foreground">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tarjeta de presentación del artista */}
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
          {data.image && (
            <img src={data.image} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{data.name || "Nombre del artista"}</p>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {data.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {data.location}
                </span>
              )}
              {data.monthlyListeners && <span>{data.monthlyListeners}</span>}
            </div>
          </div>
        </div>
        {data.tagline && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.tagline}</p>
        )}
        {socials.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {socials.map((social, i) => {
              const Icon = socialIcons[social.platform]
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <Icon className="size-3" />
                  {social.label || social.platform}
                </span>
              )
            })}
          </div>
        )}

        {/* Link + acciones */}
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
          <input
            readOnly
            value={shareUrl}
            className="w-full truncate bg-transparent text-xs text-muted-foreground outline-none"
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? "¡Copiado!" : "Copiar link"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="size-4" />
            Descargar QR
          </button>
        </div>
      </div>
    </div>
  )
}

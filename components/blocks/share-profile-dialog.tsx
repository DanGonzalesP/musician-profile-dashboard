"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { X, Copy, Check, Download, MapPin, Image as ImageIcon, Upload, Loader2 } from "lucide-react"
import type { HeroData } from "@/lib/blocks"
import { SOCIAL_PLATFORM_LABELS } from "@/lib/blocks"
import { socialIcons } from "./hero-block"
import { useLocale } from "@/components/locale-provider"
import { generateBusinessCardPdf } from "@/lib/generate-business-card-pdf"

export function ShareProfileDialog({
  shareUrl,
  data,
  albumCovers: _albumCovers,
  onClose,
}: {
  shareUrl: string
  data: HeroData
  albumCovers: string[]
  onClose: () => void
}) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Imagen para el centro del QR: ahora es SIEMPRE una foto dedicada que el
  // usuario sube acá mismo (blob local, nunca se publica ni se guarda) — ya
  // no se puede elegir entre el avatar/banner/portadas ya subidas al perfil.
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const qrImageUrlRef = useRef<string | null>(null)

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
        if (cancelled || !qrImageUrl) return

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
        img.src = qrImageUrl
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [shareUrl, qrImageUrl])

  // Libera el blob anterior al reemplazarlo o al cerrar el diálogo — la
  // imagen del QR nunca se sube a Storage, solo vive en esta pestaña.
  useEffect(() => {
    qrImageUrlRef.current = qrImageUrl
  }, [qrImageUrl])
  useEffect(() => {
    return () => {
      if (qrImageUrlRef.current) URL.revokeObjectURL(qrImageUrlRef.current)
    }
  }, [])

  function handleQrImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (qrImageUrlRef.current) URL.revokeObjectURL(qrImageUrlRef.current)
    setQrImageUrl(URL.createObjectURL(file))
    e.target.value = ""
  }

  function handleRemoveQrImage() {
    if (qrImageUrlRef.current) URL.revokeObjectURL(qrImageUrlRef.current)
    setQrImageUrl(null)
  }

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

  async function handleDownloadCard() {
    const canvas = canvasRef.current
    if (!canvas || generating) return
    setGenerating(true)
    try {
      await generateBusinessCardPdf({
        artistName: data.name || t("share_artist_name_fallback"),
        realName: data.realName,
        location: data.location,
        tagline: data.tagline,
        shareUrl,
        avatarUrl: data.image || undefined,
        qrDataUrl: canvas.toDataURL("image/png"),
      })
    } finally {
      setGenerating(false)
    }
  }

  const socials = data.socials || []

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{t("share_dialog_title")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common_close")}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* QR */}
        <div className="flex justify-center rounded-xl bg-white p-4">
          <canvas ref={canvasRef} className="size-72 max-w-full" />
        </div>

        {/* Imagen dedicada para el centro del QR — una sola foto que el
            usuario sube acá, ya no se elige entre fotos ya subidas al perfil. */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="size-3.5" /> {t("share_qr_image_label")}
          </p>
          <div className="flex items-stretch gap-2">
            {qrImageUrl && (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                <img src={qrImageUrl} alt="" className="size-full object-cover" />
              </div>
            )}
            <label className="flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
              <Upload className="size-3.5 text-muted-foreground" />
              <span>{qrImageUrl ? t("share_qr_change_cta") : t("share_qr_upload_cta")}</span>
              <input type="file" accept="image/*" onChange={handleQrImageChange} className="hidden" />
            </label>
            {qrImageUrl && (
              <button
                type="button"
                onClick={handleRemoveQrImage}
                aria-label={t("share_qr_remove_cta")}
                title={t("share_qr_remove_cta")}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tarjeta de presentación del artista */}
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
          {data.image && (
            <img src={data.image} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{data.name || t("share_artist_name_fallback")}</p>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {data.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {data.location}
                </span>
              )}
              {data.realName && <span>{data.realName}</span>}
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
                  {social.label || SOCIAL_PLATFORM_LABELS[social.platform]}
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
            {copied ? t("share_copied") : t("share_copy_link")}
          </button>
          <button
            type="button"
            onClick={handleDownloadCard}
            disabled={generating}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {generating ? t("share_card_generating") : t("share_download_card")}
          </button>
        </div>
      </div>
    </div>
  )
}

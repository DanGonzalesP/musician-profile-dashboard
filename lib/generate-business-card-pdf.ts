import { jsPDF, GState } from "jspdf"

export type BusinessCardInput = {
  artistName: string
  realName?: string
  location?: string
  tagline?: string
  shareUrl: string
  /** URL pública de la foto de perfil (avatar) — va de fondo en la cara delantera. */
  avatarUrl?: string
  /** dataURL PNG del QR ya renderizado (con o sin logo incrustado). */
  qrDataUrl: string
}

const BRAND_RED: [number, number, number] = [240, 68, 51]
const CARD_BG: [number, number, number] = [12, 12, 14]

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "perfil"
  )
}

/**
 * Descarga una imagen y la recorta en modo "cover" a un canvas de
 * targetW x targetH, devolviendo un dataURL JPEG. jsPDF.addImage() siempre
 * estira la imagen al w/h indicado sin recortar — si no se pre-recorta acá,
 * una foto que no calce con la proporción de la tarjeta saldría deformada.
 * Si la imagen no carga (ej. bloqueada por CORS), devuelve null y quien
 * llama debe seguir sin foto en vez de romper la generación del PDF.
 */
function loadImageCoverDataUrl(url: string, targetW: number, targetH: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)

        const srcRatio = img.naturalWidth / img.naturalHeight
        const dstRatio = targetW / targetH
        let sx: number, sy: number, sw: number, sh: number
        if (srcRatio > dstRatio) {
          sh = img.naturalHeight
          sw = sh * dstRatio
          sy = 0
          sx = (img.naturalWidth - sw) / 2
        } else {
          sw = img.naturalWidth
          sh = sw / dstRatio
          sx = 0
          sy = (img.naturalHeight - sh) / 2
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH)
        resolve(canvas.toDataURL("image/jpeg", 0.92))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Genera una tarjeta de presentación lista para imprimir (formato estándar
 * 85 x 55mm), con la foto de perfil a página completa en la cara delantera
 * y los datos de contacto + QR en la cara trasera — dos páginas del mismo
 * tamaño de tarjeta, una por cara, para imprimir a doble faz.
 */
export async function generateBusinessCardPdf(input: BusinessCardInput): Promise<void> {
  const CARD_W = 85
  const CARD_H = 55

  const avatarDataUrl = input.avatarUrl
    ? await loadImageCoverDataUrl(input.avatarUrl, 1000, Math.round((1000 * CARD_H) / CARD_W))
    : null

  const doc = new jsPDF({ unit: "mm", format: [CARD_W, CARD_H] })

  // ───────────────────── Cara delantera ─────────────────────
  doc.setFillColor(...CARD_BG)
  doc.rect(0, 0, CARD_W, CARD_H, "F")

  if (avatarDataUrl) {
    doc.addImage(avatarDataUrl, "JPEG", 0, 0, CARD_W, CARD_H)
  }

  // Scrim inferior simulado con bandas semitransparentes apiladas — jsPDF
  // no soporta gradientes vectoriales, así que se aproxima con varios rects.
  const scrimBands = 6
  for (let i = 0; i < scrimBands; i++) {
    const bandH = (CARD_H * 0.55) / scrimBands
    const y = CARD_H - (i + 1) * bandH
    const opacity = 0.08 + (i / (scrimBands - 1)) * 0.6
    doc.setGState(new GState({ opacity }))
    doc.setFillColor(0, 0, 0)
    doc.rect(0, y, CARD_W, bandH + 0.5, "F")
  }
  doc.setGState(new GState({ opacity: 1 }))

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(...BRAND_RED)
  doc.text("vibra", 6, 8)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text(input.artistName || "—", 6, CARD_H - 9.5)

  if (input.realName) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(220, 220, 220)
    doc.text(input.realName, 6, CARD_H - 5)
  }

  // ───────────────────── Cara trasera ─────────────────────
  doc.addPage([CARD_W, CARD_H])
  doc.setFillColor(...CARD_BG)
  doc.rect(0, 0, CARD_W, CARD_H, "F")

  const leftX = 6
  const qrSize = 27
  const qrX = CARD_W - 6 - qrSize
  const textMaxWidth = qrX - 4 - leftX

  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(...BRAND_RED)
  doc.text("vibra", leftX, 8)
  doc.setDrawColor(...BRAND_RED)
  doc.setLineWidth(0.4)
  doc.line(leftX, 10, leftX + 12, 10)

  let y = 17
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11.5)
  doc.setTextColor(255, 255, 255)
  const nameLines = (doc.splitTextToSize(input.artistName || "—", textMaxWidth) as string[]).slice(0, 2)
  doc.text(nameLines, leftX, y)
  y += nameLines.length * 4.4 + 1.5

  if (input.realName) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(190, 190, 190)
    doc.text(input.realName, leftX, y)
    y += 4.5
  }

  if (input.location) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(165, 165, 165)
    doc.text(input.location, leftX, y)
    y += 4.5
  }

  if (input.tagline) {
    y += 1.5
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.6)
    doc.setTextColor(195, 195, 195)
    const taglineLines = (doc.splitTextToSize(input.tagline, textMaxWidth) as string[]).slice(0, 3)
    doc.text(taglineLines, leftX, y)
  }

  // Placa blanca detrás del QR para asegurar buen contraste de escaneo
  // incluso sobre el fondo oscuro de la tarjeta.
  const qrY = (CARD_H - qrSize) / 2 - 1.5
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(qrX - 2.5, qrY - 2.5, qrSize + 5, qrSize + 5, 2, 2, "F")
  doc.addImage(input.qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize)

  const urlLabel = input.shareUrl.replace(/^https?:\/\//, "")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.5)
  doc.setTextColor(170, 170, 170)
  doc.text(urlLabel.length > 30 ? `${urlLabel.slice(0, 28)}…` : urlLabel, qrX + qrSize / 2, qrY + qrSize + 5.5, {
    align: "center",
  })

  doc.save(`tarjeta-${slugify(input.artistName)}.pdf`)
}

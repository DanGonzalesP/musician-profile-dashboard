import { jsPDF } from "jspdf"

export type CertificatePdfInput = {
  artistName: string
  songTitle: string
  fileHash: string
  registeredAt: string // ISO timestamp real, tal como quedó en Supabase
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "obra"
  )
}

/**
 * Genera un "Certificado de Posesión de Obra Musical": un timestamp de la
 * huella SHA-256 del archivo, con la fecha real en que quedó registrado en
 * Supabase. Es evidencia de que el artista tenía este archivo exacto en su
 * poder en esa fecha — no un registro oficial de derechos de autor (eso
 * sigue siendo INDECOPI en Perú), y el PDF lo deja explícito.
 */
export function generateAuthorshipCertificatePdf(input: CertificatePdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14

  // Marco decorativo doble, estilo diploma.
  doc.setDrawColor(180, 150, 60)
  doc.setLineWidth(1.1)
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2)
  doc.setLineWidth(0.3)
  doc.rect(margin + 3, margin + 3, pageWidth - (margin + 3) * 2, pageHeight - (margin + 3) * 2)

  let y = margin + 22

  doc.setTextColor(24, 24, 27)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("CERTIFICADO DE POSESIÓN DE OBRA MUSICAL", pageWidth / 2, y, { align: "center" })
  y += 6
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text("Prueba de autoría por marcado de tiempo (timestamping) — huella digital SHA-256", pageWidth / 2, y, {
    align: "center",
  })

  y += 18
  doc.setDrawColor(180, 150, 60)
  doc.setLineWidth(0.4)
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y)

  y += 14
  doc.setTextColor(30, 30, 30)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text("Se deja constancia de que la obra musical titulada", pageWidth / 2, y, { align: "center" })

  y += 12
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  const titleLines = doc.splitTextToSize(`"${input.songTitle || "Sin título"}"`, pageWidth - margin * 2 - 20) as string[]
  doc.text(titleLines, pageWidth / 2, y, { align: "center" })
  y += titleLines.length * 8 + 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text("se encontraba en posesión de", pageWidth / 2, y, { align: "center" })
  y += 10
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(input.artistName || "—", pageWidth / 2, y, { align: "center" })
  y += 12

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text("desde el momento de su registro, el", pageWidth / 2, y, { align: "center" })
  y += 8
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(formatTimestamp(input.registeredAt), pageWidth / 2, y, { align: "center" })

  y += 18
  const boxWidth = pageWidth - margin * 2 - 20
  const boxX = margin + 10
  doc.setDrawColor(200, 200, 200)
  doc.setFillColor(248, 248, 246)
  doc.roundedRect(boxX, y, boxWidth, 22, 2, 2, "FD")
  doc.setFont("courier", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  doc.text("Huella digital SHA-256 del archivo de audio:", boxX + 5, y + 7)
  doc.setFont("courier", "bold")
  const hashLines = doc.splitTextToSize(input.fileHash, boxWidth - 10) as string[]
  doc.text(hashLines, boxX + 5, y + 13)

  y += 22 + 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(130, 130, 130)
  const disclaimer = doc.splitTextToSize(
    "Este documento certifica que el archivo con la huella digital indicada fue registrado en la fecha señalada mediante esta plataforma. Constituye evidencia de posesión previa (timestamping), pero no reemplaza el registro oficial de derechos de autor ante INDECOPI ni sustituye asesoría legal profesional.",
    pageWidth - margin * 2 - 20
  ) as string[]
  doc.text(disclaimer, pageWidth / 2, y, { align: "center" })

  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  doc.text(`Generado el ${formatTimestamp(new Date().toISOString())}`, pageWidth / 2, pageHeight - margin - 6, {
    align: "center",
  })

  doc.save(`certificado-autoria-${slugify(input.songTitle)}.pdf`)
}

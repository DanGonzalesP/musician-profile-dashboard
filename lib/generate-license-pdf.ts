import { jsPDF } from "jspdf"

export type LicensePdfInput = {
  artistName: string
  artistLegalName: string
  artistDni: string
  organizerName: string
  eventDate: string
  eventEndDate?: string
  songs: string[]
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function formatDate(iso: string): string {
  if (!iso) return "___________"
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return `${d} de ${MESES[m - 1] ?? m} de ${y}`
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "evento"
  )
}

/**
 * Arma y descarga un PDF con la redacción formal de una licencia de uso
 * directo de obra musical, apoyada en el D. Leg. 822 (el propio titular de
 * derechos puede autorizar directamente el uso de su obra, sin pasar por una
 * sociedad de gestión colectiva como APDAYC). No sustituye asesoría legal.
 */
export function generateLicensePdf(input: LicensePdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 20
  const contentWidth = pageWidth - marginX * 2
  const bottomLimit = pageHeight - 28
  let y = 40

  doc.setFillColor(24, 24, 27)
  doc.rect(0, 0, pageWidth, 30, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text("LICENCIA DE USO DIRECTO DE OBRA MUSICAL", pageWidth / 2, 14, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.text(
    "Autorización directa del titular de derechos de autor — al margen de gestión colectiva",
    pageWidth / 2,
    21,
    { align: "center" }
  )

  doc.setTextColor(120, 120, 120)
  doc.setFontSize(9)
  const generatedOn = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })
  doc.text(`Documento generado el ${generatedOn}`, marginX, y)
  y += 10

  doc.setTextColor(30, 30, 30)

  function ensureSpace(needed: number) {
    if (y + needed > bottomLimit) {
      doc.addPage()
      y = 20
    }
  }

  function heading(text: string) {
    ensureSpace(14)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(text, marginX, y)
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
  }

  function paragraph(text: string, gap = 6) {
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    ensureSpace(lines.length * 5 + gap)
    doc.text(lines, marginX, y)
    y += lines.length * 5 + gap
  }

  const displayName =
    input.artistLegalName && input.artistLegalName !== input.artistName
      ? `${input.artistName} (nombre legal: ${input.artistLegalName})`
      : input.artistName

  heading("I. PARTES")
  paragraph(
    `EL LICENCIANTE: ${displayName || "___________"}, identificado con DNI N° ${
      input.artistDni || "___________"
    }, en su calidad de autor, intérprete y titular de los derechos patrimoniales sobre las obras musicales detalladas en la cláusula III.`
  )
  paragraph(
    `EL LICENCIATARIO: ${input.organizerName || "___________"}, en calidad de organizador, representante o responsable del local o evento donde se hará uso de dichas obras.`
  )

  heading("II. OBJETO Y BASE LEGAL")
  paragraph(
    "De conformidad con el Decreto Legislativo N° 822, Ley sobre el Derecho de Autor, el titular de los derechos patrimoniales de una obra puede autorizar directamente su explotación, sin intermediación de una sociedad de gestión colectiva, cuando dicha autorización es expresa, específica y se encuentra debidamente documentada, como en el presente caso. En virtud de ello, EL LICENCIANTE otorga a EL LICENCIATARIO autorización expresa, no exclusiva e intransferible para el uso en vivo y/o la reproducción pública de las obras señaladas en la cláusula III, durante el evento y periodo indicados en la cláusula IV."
  )

  heading("III. OBRAS AUTORIZADAS")
  if (input.songs.length === 0) {
    paragraph("(No se seleccionaron canciones específicas para esta licencia)")
  } else {
    input.songs.forEach((song, i) => paragraph(`${i + 1}. ${song}`, 2))
    y += 4
  }

  heading("IV. VIGENCIA")
  const periodText =
    input.eventEndDate && input.eventEndDate !== input.eventDate
      ? `desde el ${formatDate(input.eventDate)} hasta el ${formatDate(input.eventEndDate)}`
      : `el día ${formatDate(input.eventDate)}`
  paragraph(
    `La presente autorización rige exclusivamente para el evento realizado ${periodText}, y no se extiende a usos posteriores, grabaciones comerciales, retransmisiones ni distribución fuera del contexto aquí autorizado.`
  )

  heading("V. DECLARACIÓN")
  paragraph(
    "Ambas partes declaran conocer y aceptar los términos de la presente licencia, la cual queda acreditada mediante la firma de sus representantes a continuación."
  )

  ensureSpace(40)
  y += 12
  const colWidth = contentWidth / 2 - 10
  const leftX = marginX
  const rightX = marginX + contentWidth / 2 + 10
  doc.setDrawColor(120, 120, 120)
  doc.line(leftX, y, leftX + colWidth, y)
  doc.line(rightX, y, rightX + colWidth, y)
  y += 5
  doc.setFontSize(9)
  doc.text("Firma del Licenciante (Artista)", leftX, y)
  doc.text("Firma del Licenciatario (Organizador)", rightX, y)
  y += 5
  doc.text(input.artistName || "—", leftX, y)
  doc.text(input.organizerName || "—", rightX, y)

  doc.setFontSize(7.5)
  doc.setTextColor(140, 140, 140)
  const disclaimer =
    "Este documento es un modelo de autorización generado automáticamente por la plataforma a partir de los datos ingresados. No sustituye asesoría legal profesional; se recomienda validarlo con un abogado, especialmente para eventos de gran escala o alto riesgo."
  const discLines = doc.splitTextToSize(disclaimer, contentWidth) as string[]
  doc.text(discLines, marginX, pageHeight - 15)

  doc.save(`licencia-${slugify(input.organizerName)}-${input.eventDate || "sin-fecha"}.pdf`)
}

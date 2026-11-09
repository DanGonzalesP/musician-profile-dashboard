export type ReportInput = {
  reportedProfileId: string
  targetType: "perfil" | "bloque" | "pista" | "publicacion" | "comentario" | "producto" | "servicio"
  targetId?: string
  reason: "derechos_de_autor" | "suplantacion" | "contenido_sexual" | "violencia_o_odio" | "spam_o_estafa" | "acoso" | "otro"
  details: string
  swornStatement: boolean
  reporterEmail?: string
}

type ValidationResult = { success: true; data: ReportInput } | { success: false }

const targetTypes = new Set<ReportInput["targetType"]>([
  "perfil", "bloque", "pista", "publicacion", "comentario", "producto", "servicio",
])
const reasons = new Set<ReportInput["reason"]>([
  "derechos_de_autor", "suplantacion", "contenido_sexual", "violencia_o_odio", "spam_o_estafa", "acoso", "otro",
])
const allowedKeys = new Set([
  "reportedProfileId", "targetType", "targetId", "reason", "details", "swornStatement", "reporterEmail",
])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateReport(input: unknown): ValidationResult {
  if (!isRecord(input) || Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return { success: false }
  }

  const { reportedProfileId, targetType, reason } = input
  if (typeof reportedProfileId !== "string" || !uuidPattern.test(reportedProfileId)) return { success: false }
  if (typeof targetType !== "string" || !targetTypes.has(targetType as ReportInput["targetType"])) return { success: false }
  if (typeof reason !== "string" || !reasons.has(reason as ReportInput["reason"])) return { success: false }

  if (input.targetId !== undefined && (typeof input.targetId !== "string" || input.targetId.trim().length > 200)) {
    return { success: false }
  }
  if (typeof input.details !== "string") return { success: false }
  const details = input.details.trim()
  if (details.length < 10 || details.length > 2000) return { success: false }

  const swornStatement = input.swornStatement === undefined ? false : input.swornStatement
  if (typeof swornStatement !== "boolean" || (reason === "derechos_de_autor" && !swornStatement)) {
    return { success: false }
  }

  let reporterEmail: string | undefined
  if (input.reporterEmail !== undefined) {
    if (typeof input.reporterEmail !== "string") return { success: false }
    reporterEmail = input.reporterEmail.trim()
    if (reporterEmail.length > 320 || (reporterEmail !== "" && !emailPattern.test(reporterEmail))) return { success: false }
    if (reporterEmail === "") reporterEmail = undefined
  }

  return {
    success: true,
    data: {
      reportedProfileId,
      targetType: targetType as ReportInput["targetType"],
      ...(input.targetId === undefined ? {} : { targetId: (input.targetId as string).trim() }),
      reason: reason as ReportInput["reason"],
      details,
      swornStatement,
      ...(reporterEmail === undefined ? {} : { reporterEmail }),
    },
  }
}

export const reportSchema = { safeParse: validateReport }

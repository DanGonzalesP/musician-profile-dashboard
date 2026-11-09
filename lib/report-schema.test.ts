import { describe, expect, it } from "vitest"
import { reportSchema } from "./report-schema"

const validReport = (overrides: Record<string, unknown> = {}) => ({
  reportedProfileId: "550e8400-e29b-41d4-a716-446655440000",
  targetType: "perfil",
  reason: "otro",
  details: "Este contenido requiere revisión.",
  ...overrides,
})

const parse = (input: unknown) => {
  const result = reportSchema.safeParse(input)
  if (!result.success) throw new Error("Expected valid report")
  return result.data
}

describe("reportSchema", () => {
  it("acepta un reporte válido y aplica el juramento por defecto", () => {
    expect(parse(validReport())).toMatchObject({ swornStatement: false })
  })

  it("recorta campos de texto y transforma un correo vacío en undefined", () => {
    const parsed = parse(validReport({
      targetId: "  publicación  ",
      details: "  Este contenido requiere revisión.  ",
      reporterEmail: "   ",
    }))
    expect(parsed.targetId).toBe("publicación")
    expect(parsed.details).toBe("Este contenido requiere revisión.")
    expect(parsed.reporterEmail).toBeUndefined()
  })

  it("acepta todos los valores permitidos para tipo y motivo", () => {
    const targetTypes = ["perfil", "bloque", "pista", "publicacion", "comentario", "producto", "servicio"]
    const reasons = ["derechos_de_autor", "suplantacion", "contenido_sexual", "violencia_o_odio", "spam_o_estafa", "acoso", "otro"]
    for (const targetType of targetTypes) {
      for (const reason of reasons) {
        expect(reportSchema.safeParse(validReport({ targetType, reason, swornStatement: true })).success).toBe(true)
      }
    }
  })

  it("rechaza UUID, enums y longitudes inválidos", () => {
    for (const input of [
      validReport({ reportedProfileId: "no-uuid" }),
      validReport({ targetType: "usuario" }),
      validReport({ reason: "ilegal" }),
      validReport({ targetId: "x".repeat(201) }),
      validReport({ details: "corto" }),
      validReport({ details: "x".repeat(2001) }),
    ]) expect(reportSchema.safeParse(input).success).toBe(false)
  })

  it("rechaza correo malformado, incluso si excede el máximo", () => {
    expect(reportSchema.safeParse(validReport({ reporterEmail: "no-es-correo" })).success).toBe(false)
    expect(reportSchema.safeParse(validReport({ reporterEmail: `${"a".repeat(310)}@example.com` })).success).toBe(false)
  })

  it("exige swornStatement para motivos de derechos de autor", () => {
    expect(reportSchema.safeParse(validReport({ reason: "derechos_de_autor" })).success).toBe(false)
    expect(reportSchema.safeParse(validReport({ reason: "derechos_de_autor", swornStatement: true })).success).toBe(true)
  })

  it("rechaza campos administrativos adicionales", () => {
    expect(reportSchema.safeParse(validReport({ reporterUserId: "admin-id" })).success).toBe(false)
  })
})

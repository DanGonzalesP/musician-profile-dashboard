import { describe, expect, it } from "vitest"
import { LEGAL_VERSIONS, isLegalAcceptanceRequired, legalDeclaration } from "./legal-acceptance"

describe("declaración legal del alta", () => {
  it("exige términos y mayoría de edad a la vez", () => {
    expect(legalDeclaration(false, true)).toBeNull()
    expect(legalDeclaration(true, false)).toBeNull()
    expect(legalDeclaration(false, false)).toBeNull()
  })

  it("con ambas casillas declara las versiones vigentes y sólo mayoría de edad", () => {
    expect(legalDeclaration(true, true)).toEqual({
      terms_version: LEGAL_VERSIONS.terms, privacy_version: LEGAL_VERSIONS.privacy, age_assurance: "adult_self_declared",
    })
  })

  it("las versiones tienen el formato que la base acepta", () => {
    for (const version of Object.values(LEGAL_VERSIONS)) expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("reconoce el rechazo de la base sin depender de otros errores", () => {
    expect(isLegalAcceptanceRequired({ message: "aceptacion_legal_requerida" })).toBe(true)
    expect(isLegalAcceptanceRequired({ message: "duplicate key" })).toBe(false)
    expect(isLegalAcceptanceRequired(null)).toBe(false)
  })
})

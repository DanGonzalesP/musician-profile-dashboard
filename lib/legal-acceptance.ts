// Versiones vigentes de Términos y Privacidad y la declaración que viaja en el
// alta. La base (0071) copia `vibe_legal` una sola vez a una tabla privada al
// crearse la cuenta; sin esa constancia una cuenta nueva no puede crear perfil.
//
// Al cambiar sustancialmente un documento, subir su fecha aquí y en la página.
// Edad: política provisional 18+ hasta que el titular apruebe edad mínima y
// consentimientos para menores (docs/preparacion-legal-peru.md).
export const LEGAL_VERSIONS = { terms: "2026-11-09", privacy: "2026-11-09" } as const

export type LegalDeclaration = {
  terms_version: string
  privacy_version: string
  age_assurance: "adult_self_declared"
}

/** Sólo devuelve la declaración si la persona marcó ambas casillas. */
export function legalDeclaration(acceptsTerms: boolean, declaresAdult: boolean): LegalDeclaration | null {
  if (!acceptsTerms || !declaresAdult) return null
  return { terms_version: LEGAL_VERSIONS.terms, privacy_version: LEGAL_VERSIONS.privacy, age_assurance: "adult_self_declared" }
}

/** Mensaje seguro cuando la base rechaza crear un perfil sin constancia. */
export function isLegalAcceptanceRequired(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("aceptacion_legal_requerida"))
}

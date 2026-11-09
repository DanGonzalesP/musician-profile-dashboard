/** Diagnóstico del cliente sin contenido, tokens ni detalles de consultas. */
export function logSupabaseError(context: string, error: unknown): void {
  const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined
  // Sólo códigos estructurados conocidos por su formato, nunca message/details/hint.
  const code = typeof rawCode === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(rawCode)
    ? rawCode : "UNCLASSIFIED"
  console.error(`[${context}] Operación no confirmada (${code}).`)
}

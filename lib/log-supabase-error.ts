/**
 * PostgrestError no es un Error de JS — console.error(err) a veces solo
 * muestra "[object Object]". Esto imprime siempre message/code/details/hint
 * como texto plano, para poder ver en la consola del navegador exactamente
 * por qué falló un insert/update (ej. violación de RLS, tabla inexistente).
 */
export function logSupabaseError(context: string, error: unknown): void {
  if (error && typeof error === "object" && "message" in error) {
    const e = error as { message: string; code?: string; details?: string; hint?: string }
    console.error(
      `[${context}] ${e.message}` +
        (e.code ? ` | código: ${e.code}` : "") +
        (e.details ? ` | detalles: ${e.details}` : "") +
        (e.hint ? ` | pista: ${e.hint}` : "")
    )
  } else {
    console.error(`[${context}]`, error)
  }
}

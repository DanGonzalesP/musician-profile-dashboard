// Traducción de los errores del límite de escritura de la base al mensaje que
// ve el usuario.
//
// Los triggers de `supabase/migrations/0011_limites_de_escritura.sql` levantan
// una excepción cuyo mensaje empieza por `limite_de_escritura:`. Sin esta
// traducción, ese texto de Postgres llegaría tal cual al toast del feed, que
// es exactamente lo que el resto del proyecto evita.
//
// La interfaz NO cambia: mismo toast, mismo sitio, distinto texto.

/** Marca estable que emiten los triggers. Si cambia aquí, cambia en 0011. */
const MARCA = "limite_de_escritura"

export type AccionLimitada =
  | "comentario"
  | "pregunta"
  | "reporte"
  | "bloqueo"

const MENSAJES: Record<AccionLimitada, string> = {
  comentario:
    "Estás comentando muy rápido. Espera un momento y vuelve a intentarlo.",
  pregunta:
    "Ya enviaste varias preguntas seguidas. Espera un rato antes de mandar otra.",
  reporte:
    "Ya enviaste varios reportes seguidos. Espera un momento; los que mandaste ya están en la cola.",
  bloqueo:
    "Hiciste muchos bloqueos seguidos. Espera un momento y vuelve a intentarlo.",
}

/** ¿Este error viene del límite de escritura de la base? */
export function esLimiteDeEscritura(error: unknown): boolean {
  if (!error) return false
  const mensaje =
    typeof error === "string"
      ? error
      : typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message)
        : ""
  return mensaje.includes(MARCA)
}

/**
 * Devuelve el mensaje amable si el error es del límite, o `null` si no lo es
 * (para que quien llama siga con su manejo habitual).
 */
export function mensajeDeLimite(error: unknown, accion: AccionLimitada): string | null {
  return esLimiteDeEscritura(error) ? MENSAJES[accion] : null
}

/**
 * Atajo para el patrón que se repite en lib/post-comments.ts,
 * lib/track-comments.ts, lib/profile-questions.ts y lib/moderation.ts:
 * si es límite, mensaje amable; si no, el que ya se usaba.
 */
export function traducirErrorDeEscritura(
  error: unknown,
  accion: AccionLimitada,
  porDefecto: string
): string {
  return mensajeDeLimite(error, accion) ?? porDefecto
}

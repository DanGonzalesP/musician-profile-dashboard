// Decisión de consentimiento de analítica (P-31).
//
// PROBLEMA QUE RESUELVE
// `/legal/cookies` promete que Vibe no rastrea, pero `@vercel/analytics` se
// cargaba en producción sin preguntar nada. Una política que la aplicación no
// cumple es peor que no tenerla: es una afirmación falsa por escrito.
//
// QUÉ HACE: guarda una decisión de tres estados y deja que la interfaz respete
// la que corresponda. El estado por defecto es "sin decidir", y **sin decisión
// la analítica NO carga** — fail-closed, igual que el resto del proyecto.
//
// POR QUÉ EN localStorage Y NO EN UNA COOKIE
// Porque la decisión sólo la necesita el navegador: es lo que gobierna si se
// monta o no un componente cliente. Guardarla en una cookie la mandaría en cada
// petición al servidor sin que nadie la lea, que es exactamente el tipo de
// cookie que la política dice no usar.
//
// La lógica vive acá, separada del componente, para poder probarla sin montar
// React ni un navegador.

export type DecisionCookies = "aceptado" | "rechazado" | "sin-decidir"

/** Clave del almacenamiento. Aparece tal cual en la tabla de /legal/cookies. */
export const CLAVE_CONSENTIMIENTO = "vibe:consentimiento-analitica"

/** Evento propio: permite que aceptar surta efecto sin recargar la página. */
export const EVENTO_CONSENTIMIENTO = "vibe:consentimiento-cambiado"

/** Normaliza cualquier valor guardado (incluida basura escrita a mano). */
export function normalizarDecision(valor: unknown): DecisionCookies {
  return valor === "aceptado" || valor === "rechazado" ? valor : "sin-decidir"
}

/** ¿Se puede cargar la analítica con esta decisión? Sólo un sí explícito. */
export function permiteAnalitica(decision: DecisionCookies): boolean {
  return decision === "aceptado"
}

/** ¿Hay que preguntar? Sólo mientras no exista una decisión guardada. */
export function debePreguntar(decision: DecisionCookies): boolean {
  return decision === "sin-decidir"
}

/**
 * Lee la decisión del navegador. Devuelve "sin-decidir" en el servidor y
 * también si el almacenamiento está bloqueado (modo privado de Safari, o un
 * navegador con las cookies de terceros desactivadas lanzan al leer): ante la
 * duda, no se rastrea.
 */
export function leerDecision(): DecisionCookies {
  if (typeof window === "undefined") return "sin-decidir"
  try {
    return normalizarDecision(window.localStorage.getItem(CLAVE_CONSENTIMIENTO))
  } catch {
    return "sin-decidir"
  }
}

/**
 * Guarda la decisión y avisa al resto de la aplicación en la misma pestaña
 * (`storage` sólo se dispara en las OTRAS pestañas, así que sin este evento
 * aceptar no tendría efecto hasta recargar).
 */
export function guardarDecision(decision: Exclude<DecisionCookies, "sin-decidir">): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CLAVE_CONSENTIMIENTO, decision)
  } catch {
    // Si no se puede persistir, la decisión vale para esta sesión y se
    // volverá a preguntar. Nunca se cae la página por esto.
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: decision }))
}

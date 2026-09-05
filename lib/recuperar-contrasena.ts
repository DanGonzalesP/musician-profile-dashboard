import { SITE_URL } from "@/lib/site"

// Lógica pura del flujo de recuperación de contraseña.
//
// Vive aparte de los componentes por la misma razón que
// `lib/upload-validation.ts`: se puede probar sin red, sin navegador y sin
// Supabase, que es donde conviene que estén las reglas que protegen una cuenta.

/**
 * Mínimo de caracteres. Supabase acepta 6 por defecto; aquí se pide 8.
 *
 * No es una cifra al azar ni un capricho de "seguridad": 6 caracteres es lo
 * que un atacante prueba entero por fuerza bruta sin despeinarse. 8 es el
 * mínimo que recomienda el NIST (SP 800-63B) para contraseñas elegidas por
 * una persona. No se exigen mayúsculas ni símbolos a propósito: esas reglas
 * empujan a la gente a `Password1!` —que es peor que una frase larga— y el
 * mismo NIST recomienda no imponerlas.
 */
export const LONGITUD_MINIMA_CONTRASENA = 8

/** Qué está mal con la contraseña propuesta. `null` = nada. */
export type ErrorContrasena = "corta" | "no-coincide" | null

/**
 * Valida la contraseña nueva ANTES de mandarla a Supabase.
 *
 * El orden importa y es deliberado: primero la longitud, después la
 * coincidencia. Si alguien escribe una contraseña corta en los dos campos,
 * el mensaje útil es "es muy corta", no "no coinciden" (que sería falso).
 */
export function validarContrasenaNueva(
  contrasena: string,
  confirmacion: string
): ErrorContrasena {
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) return "corta"
  if (contrasena !== confirmacion) return "no-coincide"
  return null
}

/**
 * A dónde vuelve el usuario desde el enlace del correo.
 *
 * Sale de `SITE_URL` y no de `window.location.origin` por dos motivos:
 *
 *   • Supabase sólo acepta URLs de una lista blanca configurada en el panel.
 *     Derivarla del origen actual haría que desde un dominio de vista previa
 *     el correo llegara con un enlace que Supabase rechaza, y el usuario vería
 *     un error sin ninguna pista de por qué.
 *
 *   • Es determinista: el mismo valor en el servidor y en el navegador, y el
 *     mismo que hay que pegar en la lista blanca.
 */
export function urlDeRetornoDeRecuperacion(): string {
  return `${SITE_URL.replace(/\/$/, "")}/nueva-contrasena`
}

/**
 * El mensaje que se muestra tras pedir el enlace.
 *
 * ⚠️ Es SIEMPRE el mismo, exista la cuenta o no, y por eso es una constante y
 * no una rama: si el mensaje cambiara según el resultado, el formulario se
 * convertiría en un oráculo para averiguar qué correos están registrados en
 * Vibe. Eso tiene valor real para quien prepare un ataque dirigido o una
 * campaña de phishing contra artistas concretos.
 *
 * Vale también cuando Supabase devuelve error: se registra del lado del
 * cliente si hace falta, pero al visitante se le dice lo mismo.
 */
export const MENSAJE_ENLACE_ENVIADO = "auth_recovery_sent"

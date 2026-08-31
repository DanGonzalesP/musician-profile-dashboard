import type { SupabaseClient } from "@supabase/supabase-js"

// Salvaguarda: ¿la base del otro lado es DE VERDAD la de Vibe?
//
// ─── POR QUÉ NO BASTA CON "ES LOCALHOST" ──────────────────────────────────
// `exigirEntornoLocal()` comprueba que la URL sea de esta máquina, y eso evita
// el desastre grande: borrar usuarios de producción. Pero deja pasar uno más
// silencioso.
//
// El CLI de Supabase levanta cada proyecto en el bloque de puertos 543xx por
// defecto, y firma los JWT locales con el MISMO secreto de demostración
// (`super-secret-jwt-token-with-at-least-32-characters-long`) en todos ellos.
// Con dos proyectos en la misma máquina —acá conviven Vibe y Bancary— eso
// significa que:
//
//   • si el otro proyecto arrancó primero, se queda con el 54321;
//   • `SUPABASE_TEST_URL` sigue respondiendo, así que nada falla;
//   • y la clave de servicio de Vibe **autentica igual**, porque el secreto es
//     el mismo.
//
// Resultado: la suite crea y borra usuarios en el proyecto equivocado sin
// decir una palabra. No es hipotético: pasó en esta máquina el 2026-08-17, y
// por eso `supabase/config.toml` movió a Vibe al bloque 544xx.
//
// Los puertos arreglan la causa. Esto arregla el síntoma aunque la causa
// vuelva: antes de tocar nada, se le pregunta a la base si es la de Vibe.

/**
 * Columnas que, juntas, sólo existen en el esquema de Vibe.
 *
 * `content_version` la añadió `0007` (versión optimista de la publicación),
 * `username` la añadió `0006` y `is_suspended` la añadió `0008`. Una tabla
 * `profiles` que tenga las tres es la de Vibe; un `profiles` de otro proyecto
 * fallaría en al menos una.
 */
const COLUMNAS_MARCADORAS = "id, username, content_version, is_suspended"

let verificada: string | null = null

/**
 * Comprueba una sola vez por proceso que la base sea la de Vibe. Idempotente y
 * memorizada: la llaman todos los archivos de prueba y no tiene sentido pagar
 * la consulta más de una vez.
 *
 * Se le pasa el cliente administrativo a propósito: si la comprobación fallara
 * por RLS en vez de por esquema, el mensaje sería engañoso.
 */
export async function exigirBaseDeVibe(admin: SupabaseClient, url: string): Promise<void> {
  if (verificada === url) return

  const { error } = await admin.from("profiles").select(COLUMNAS_MARCADORAS).limit(1)

  if (error) {
    throw new Error(
      [
        `La base en ${url} responde, pero NO parece la de Vibe.`,
        "",
        `Se pidió \`profiles(${COLUMNAS_MARCADORAS})\` y falló: ${error.message}`,
        "",
        "La causa habitual: otro proyecto de Supabase local se quedó con el",
        "puerto. El CLI usa 543xx por defecto para todos y firma los JWT con el",
        "mismo secreto de demostración, así que la clave de servicio de Vibe",
        "autentica igual y nada falla — sólo que se estaría trabajando sobre",
        "la base equivocada.",
        "",
        "Qué hacer:",
        "  1. docker ps   →  ver qué proyecto tiene tomado el puerto.",
        "  2. Vibe corre en el bloque 544xx (ver supabase/config.toml).",
        "  3. pnpm db:start  y copiar la URL a SUPABASE_TEST_URL en .env.local.",
      ].join("\n")
    )
  }

  verificada = url
}

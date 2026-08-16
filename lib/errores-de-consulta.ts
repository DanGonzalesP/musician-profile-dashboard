// Traducción de errores de PostgREST a algo que una persona pueda leer.
//
// PROBLEMA QUE RESUELVE (P-03)
// Dos pantallas del panel —`/perfil/pedidos` y `/perfil/dashboard`— consultan
// tablas que en esta base no existen (`order_items`) o que quedaron cerradas
// sin política de lectura (`donations`, del prototipo anterior). Hasta ahora,
// cuando la consulta fallaba, la pantalla mostraba **el texto crudo de
// Postgres** al usuario: `relation "public.order_items" does not exist`.
//
// Eso está mal por dos motivos distintos:
//   • Le cuenta al visitante cómo se llaman las tablas por dentro, que es
//     justo lo que el resto del proyecto se cuida de no filtrar.
//   • Y para el artista no significa nada: parece que la aplicación se rompió,
//     cuando en realidad esa parte simplemente todavía no existe.
//
// Lo que NO hace este módulo: decidir si el modelo de pedidos se implementa o
// las pantallas se retiran. Esa es una decisión de producto (§8 #6 del plan).
// Mientras tanto, la pantalla dice la verdad en vez de un error de base.

export type ErrorDeConsulta = { code?: string | null; message?: string | null } | null | undefined

/** `42P01` es `undefined_table` en Postgres; `PGRST205`, su equivalente vía PostgREST. */
export function esTablaAusente(error: ErrorDeConsulta): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const mensaje = (error.message ?? "").toLowerCase()
  return mensaje.includes("does not exist") && mensaje.includes("relation")
}

/**
 * `42501` es `insufficient_privilege`; PostgREST también devuelve `PGRST301`
 * cuando la RLS no deja ver nada. Para el usuario son lo mismo: "esto no está
 * disponible para tu cuenta".
 */
export function esPermisoDenegado(error: ErrorDeConsulta): boolean {
  if (!error) return false
  if (error.code === "42501" || error.code === "PGRST301") return true
  const mensaje = (error.message ?? "").toLowerCase()
  return mensaje.includes("permission denied") || mensaje.includes("row-level security")
}

/**
 * Mensaje para mostrar en pantalla. Nunca devuelve el texto de Postgres.
 *
 * @param nombreSeccion cómo llamar a lo que no se pudo cargar, en la voz del
 *        producto: "el historial de pedidos", "los aportes recibidos".
 */
export function mensajeDeErrorDeConsulta(error: ErrorDeConsulta, nombreSeccion: string): string {
  if (esTablaAusente(error)) {
    return `${capitalizar(nombreSeccion)} todavía no está disponible en tu cuenta.`
  }
  if (esPermisoDenegado(error)) {
    return `No tienes acceso a ${nombreSeccion} en este momento.`
  }
  return `No se pudo cargar ${nombreSeccion}. Vuelve a intentarlo en unos minutos.`
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

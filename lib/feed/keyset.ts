// Paginación por cursor (keyset) para las listas del feed. Cierra P-17.
//
// EL PROBLEMA CON `order + limit + offset`
// Con contenido entrando entre una página y la siguiente, el desplazamiento se
// corre: si mientras el visitante lee la página 1 se publican tres canciones
// nuevas, la página 2 (`offset 50`) devuelve tres filas que ya vio y se salta
// otras tres que nunca verá. No es un detalle teórico: es exactamente lo que
// pasa en un feed activo.
//
// EL KEYSET
// En vez de "saltea 50", se pide "lo que va DESPUÉS de esta fila concreta".
// La fila se identifica por `(created_at, id)`: `created_at` ordena, e `id`
// desempata cuando dos filas comparten marca de tiempo al milisegundo (pasa,
// y sin desempate la paginación se cuelga repitiendo el mismo bloque).
//
// Ordenando por `(created_at desc, id desc)`, la condición de "más viejo que
// el cursor" es:
//
//     created_at < cursor.createdAt
//     OR (created_at = cursor.createdAt AND id < cursor.id)
//
// que es lo que arma `expresionKeyset()` en la sintaxis de PostgREST. Los
// índices que la hacen barata están en la migración 0012.

export type CursorFeed = {
  /** `created_at` de la última fila entregada, en ISO 8601. */
  createdAt: string
  /** `id` de esa misma fila. Desempata las marcas de tiempo iguales. */
  id: string
}

/**
 * PostgREST interpreta comas y paréntesis como separadores dentro de `or=(…)`.
 * Un valor que los contenga rompería la expresión, así que se cita. Los ids y
 * las fechas ISO nunca los traen, pero el saneo no es opcional cuando el valor
 * viaja a un filtro.
 */
function citar(valor: string): string {
  return `"${valor.replace(/["\\]/g, "")}"`
}

/** Condición `or` de PostgREST para "estrictamente después del cursor". */
export function expresionKeyset(cursor: CursorFeed): string {
  const fecha = citar(cursor.createdAt)
  const id = citar(cursor.id)
  return `created_at.lt.${fecha},and(created_at.eq.${fecha},id.lt.${id})`
}

/**
 * Cursor de la última fila de una página. `null` si la página vino vacía —
 * señal de que no hay más contenido y no hay que pedir otra.
 */
export function cursorDeUltimaFila(
  filas: { id: string | number; created_at?: string | null }[]
): CursorFeed | null {
  const ultima = filas[filas.length - 1]
  if (!ultima || !ultima.created_at) return null
  return { createdAt: ultima.created_at, id: String(ultima.id) }
}

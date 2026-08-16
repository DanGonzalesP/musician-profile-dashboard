// Lectura de un cuerpo de respuesta con techo de bytes REALES.
//
// Por qué existe (P-06 del PLAN_VIBE_EMPRESARIAL.md): comprobar
// `Content-Length` no es comprobar el tamaño. Esa cabecera la declara el
// upstream y puede faltar (respuesta troceada), venir mentida, o llegar en 0.
// Mientras el cuerpo se reenvíe como stream sin contar, el techo de 10 MB de
// /api/image-proxy es una promesa que la ruta no cumple.
//
// Decisión de diseño: se BUFFERIZA hasta el tope en vez de encadenar un
// TransformStream que aborte a mitad de camino. El motivo es el criterio de
// aceptación: "image-proxy responde 413 al superar 10 MB reales". Un
// TransformStream no puede devolver 413 porque para cuando descubre el exceso
// las cabeceras ya salieron y el cliente recibe una imagen truncada, que es
// peor que un error claro. El costo es acotado y conocido: como máximo
// `maxBytes` en memoria (10 MB), en una función que ya tiene 128 MB.

/** Lo que devuelve `leerConTope`. `excedido` distingue el corte del fin normal. */
export type LecturaAcotada =
  | { excedido: false; bytes: Uint8Array }
  | { excedido: true; bytes: null }

/**
 * Lee el stream entero acumulando bytes, y corta en cuanto el total supera
 * `maxBytes`. Cancela el stream al cortar, para no seguir descargando algo que
 * ya se descartó.
 *
 * @param stream   cuerpo de la respuesta upstream
 * @param maxBytes techo inclusivo: exactamente `maxBytes` pasa, `maxBytes + 1` no
 */
export async function leerConTope(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<LecturaAcotada> {
  const lector = stream.getReader()
  const trozos: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await lector.read()
      if (done) break
      if (!value) continue

      total += value.byteLength
      if (total > maxBytes) {
        // No guardamos este trozo: ya sabemos que la respuesta se descarta.
        await lector.cancel().catch(() => {})
        return { excedido: true, bytes: null }
      }
      trozos.push(value)
    }
  } finally {
    lector.releaseLock()
  }

  return { excedido: false, bytes: unir(trozos, total) }
}

function unir(trozos: Uint8Array[], total: number): Uint8Array {
  const salida = new Uint8Array(total)
  let offset = 0
  for (const trozo of trozos) {
    salida.set(trozo, offset)
    offset += trozo.byteLength
  }
  return salida
}

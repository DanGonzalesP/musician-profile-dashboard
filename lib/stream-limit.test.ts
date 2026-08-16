import { describe, it, expect, vi } from "vitest"
import { leerConTope } from "./stream-limit"

/** Stream que emite los trozos dados, uno por lectura. */
function streamDe(trozos: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const t of trozos) controller.enqueue(new Uint8Array(t))
      controller.close()
    },
  })
}

/** Stream de N bytes repartidos en trozos de `tam`. */
function streamDeTamano(total: number, tam = 7): ReadableStream<Uint8Array> {
  const trozos: number[][] = []
  for (let restante = total; restante > 0; restante -= tam) {
    trozos.push(new Array(Math.min(tam, restante)).fill(0x41))
  }
  return streamDe(trozos)
}

describe("leerConTope", () => {
  it("devuelve el contenido completo cuando cabe bajo el tope", async () => {
    const r = await leerConTope(streamDe([[1, 2, 3], [4, 5]]), 10)
    expect(r.excedido).toBe(false)
    expect(Array.from(r.bytes!)).toEqual([1, 2, 3, 4, 5])
  })

  it("no rompe con un stream vacío", async () => {
    const r = await leerConTope(streamDe([]), 10)
    expect(r).toEqual({ excedido: false, bytes: new Uint8Array(0) })
  })

  it("el tope es INCLUSIVO: exactamente maxBytes pasa", async () => {
    const r = await leerConTope(streamDeTamano(1024), 1024)
    expect(r.excedido).toBe(false)
    expect(r.bytes!.byteLength).toBe(1024)
  })

  it("un solo byte de más lo rechaza", async () => {
    const r = await leerConTope(streamDeTamano(1025), 1024)
    expect(r).toEqual({ excedido: true, bytes: null })
  })

  it("detecta el exceso aunque llegue repartido en muchos trozos pequeños", async () => {
    // El caso que el Content-Length no cubre: transferencia troceada sin
    // cabecera de longitud. Ningún trozo supera el tope por sí solo.
    const r = await leerConTope(streamDeTamano(5000, 3), 4096)
    expect(r.excedido).toBe(true)
  })

  it("cancela el stream al cortar, para no seguir descargando lo descartado", async () => {
    const cancelado = vi.fn()
    let emitidos = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitidos += 1
        controller.enqueue(new Uint8Array(512))
      },
      cancel: cancelado,
    })

    const r = await leerConTope(stream, 1024)
    expect(r.excedido).toBe(true)
    expect(cancelado).toHaveBeenCalled()
    // Se corta en el trozo que rompe el techo, no se drena la fuente infinita.
    expect(emitidos).toBeLessThan(10)
  })

  it("con tope 0 rechaza cualquier byte pero acepta el vacío", async () => {
    expect((await leerConTope(streamDe([[1]]), 0)).excedido).toBe(true)
    expect((await leerConTope(streamDe([]), 0)).excedido).toBe(false)
  })

  it("propaga un error del upstream en vez de devolver datos parciales", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.error(new Error("upstream cortó"))
      },
    })
    await expect(leerConTope(stream, 1024)).rejects.toThrow("upstream cortó")
  })
})

import { describe, it, expect, vi, afterEach } from "vitest"
import { redactar, logInfo, logWarn, logError, idDePeticion } from "./log"

afterEach(() => {
  vi.restoreAllMocks()
})

/** Serializa lo que emitió el logger, para buscar fugas en el texto final. */
function capturar(fn: () => void, metodo: "log" | "warn" | "error" = "log"): string {
  const spy = vi.spyOn(console, metodo).mockImplementation(() => {})
  fn()
  expect(spy).toHaveBeenCalledTimes(1)
  return spy.mock.calls[0][0] as string
}

describe("redactar — criterio de aceptación de F12", () => {
  it("redacta email, dni y access_token (el caso exacto del plan)", () => {
    const salida = JSON.stringify(
      redactar({ email: "ana@ejemplo.com", dni: "12345678", access_token: "eyJhbGciOi..." })
    )
    expect(salida).not.toContain("ana@ejemplo.com")
    expect(salida).not.toContain("12345678")
    expect(salida).not.toContain("eyJhbGciOi")
    expect(salida).toContain("[redactado]")
  })

  it("redacta a cualquier profundidad, no solo en el primer nivel", () => {
    const salida = JSON.stringify(
      redactar({ peticion: { cabeceras: { authorization: "Bearer secreto-real" } } })
    )
    expect(salida).not.toContain("secreto-real")
  })

  it("redacta dentro de arreglos", () => {
    const salida = JSON.stringify(redactar({ usuarios: [{ email: "b@c.d" }, { email: "e@f.g" }] }))
    expect(salida).not.toContain("b@c.d")
    expect(salida).not.toContain("e@f.g")
  })

  it("redacta el contenido de los bloques y los borradores", () => {
    const salida = JSON.stringify(
      redactar({ bloque: { block_type: "hero", content: { titulo: "letra inédita" } } })
    )
    expect(salida).not.toContain("letra inédita")
    // El tipo de bloque sí es útil y no es PII.
    expect(salida).toContain("hero")
  })

  it("pilla las variantes con sufijo y con prefijo", () => {
    const salida = JSON.stringify(
      redactar({ user_email: "x@y.z", refresh_token: "rt", legal_settings: { dni: "9" }, telefono: "999" })
    )
    for (const fuga of ["x@y.z", "rt", '"9"', "999"]) expect(salida).not.toContain(fuga)
  })

  it("conserva lo que sí sirve para operar", () => {
    const salida = redactar({
      userId: "8f3a-uuid",
      requestId: "req-1",
      duracionMs: 143,
      resultado: "ok",
      folder: "audio",
      total: 12,
    }) as Record<string, unknown>
    expect(salida).toEqual({
      userId: "8f3a-uuid",
      requestId: "req-1",
      duracionMs: 143,
      resultado: "ok",
      folder: "audio",
      total: 12,
    })
  })

  it("recorta cadenas gigantes en vez de volcarlas enteras", () => {
    const salida = redactar({ nota: "a".repeat(5000) }) as { nota: string }
    expect(salida.nota.length).toBeLessThan(600)
    expect(salida.nota).toContain("[recortado]")
  })

  it("no se cuelga con un objeto ciclado", () => {
    const a: Record<string, unknown> = { nombre: "a" }
    a.yo = a
    expect(JSON.stringify(redactar(a))).toContain("[ciclo]")
  })

  it("corta a una profundidad máxima", () => {
    let hondo: Record<string, unknown> = { fin: 1 }
    for (let i = 0; i < 20; i++) hondo = { nivel: hondo }
    expect(JSON.stringify(redactar(hondo))).toContain("[profundidad máxima]")
  })

  it("aplana un Error a nombre y mensaje sin filtrar la pila local", () => {
    const e = new TypeError("algo falló")
    const r = redactar(e) as { nombre: string; mensaje: string; pila?: string }
    expect(r.nombre).toBe("TypeError")
    expect(r.mensaje).toBe("algo falló")
    expect(r.pila).toBeUndefined()
  })

  it("redacta secretos y PII aunque vengan incrustados en texto o en un Error", () => {
    const salida = JSON.stringify(
      redactar(new Error("falló ana@ejemplo.com DNI 12345678 Authorization: Bearer abc.secreto"))
    )
    expect(salida).not.toContain("ana@ejemplo.com")
    expect(salida).not.toContain("12345678")
    expect(salida).not.toContain("abc.secreto")

    const url = JSON.stringify(redactar({ detalle: "https://r2/x?X-Amz-Signature=firma-real&ok=1" }))
    expect(url).not.toContain("firma-real")
  })

  it("no rompe con tipos no serializables", () => {
    // BigInt(10) y no `10n`: tsconfig apunta a un target anterior a ES2020.
    const r = redactar({ f: () => {}, s: Symbol("x"), n: BigInt(10), d: new Date("2026-01-01T00:00:00Z") })
    expect(r).toEqual({ f: "[no serializable]", s: "[no serializable]", n: "10", d: "2026-01-01T00:00:00.000Z" })
  })
})

describe("emisión", () => {
  it("logInfo emite una sola línea JSON parseable con los campos estables", () => {
    const linea = capturar(() => logInfo("api/salud", "todo bien", { requestId: "r1", duracionMs: 5 }))
    const o = JSON.parse(linea)
    expect(o).toMatchObject({ nivel: "info", ruta: "api/salud", mensaje: "todo bien", requestId: "r1", duracionMs: 5 })
    expect(typeof o.ts).toBe("string")
  })

  it("logWarn va a console.warn y logError a console.error", () => {
    expect(JSON.parse(capturar(() => logWarn("r", "ojo"), "warn")).nivel).toBe("warn")
    expect(JSON.parse(capturar(() => logError("r", "boom", new Error("x")), "error")).nivel).toBe("error")
  })

  it("logError marca resultado=error y aplana el error", () => {
    const o = JSON.parse(capturar(() => logError("api/x", "falló", new Error("detalle")), "error"))
    expect(o.resultado).toBe("error")
    expect(o.error.mensaje).toBe("detalle")
  })

  it("logError redacta los campos igual que el resto", () => {
    const linea = capturar(
      () => logError("api/x", "falló", new Error("boom"), { email: "fuga@ejemplo.com", userId: "u1" }),
      "error"
    )
    expect(linea).not.toContain("fuga@ejemplo.com")
    expect(linea).toContain("u1")
  })

  it("un valor lanzado que no es Error tampoco rompe la emisión", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logError("r", "m", undefined)
    logError("r", "m", "texto suelto")
    logError("r", "m", { code: "PGRST202" })
    expect(spy).toHaveBeenCalledTimes(3)
    for (const [linea] of spy.mock.calls) expect(() => JSON.parse(linea as string)).not.toThrow()
  })
})

describe("idDePeticion", () => {
  const req = (h: Record<string, string> = {}) => new Request("https://x", { headers: h })

  it("prefiere cf-ray, el identificador que ya pone Cloudflare", () => {
    expect(idDePeticion(req({ "cf-ray": "8f2a1b3c4d5e6f70-LIM" }))).toBe("8f2a1b3c4d5e6f70-LIM")
  })

  it("cae a x-request-id", () => {
    expect(idDePeticion(req({ "x-request-id": "r-9" }))).toBe("r-9")
  })

  // El valor de cf-ray es el que se pega en el buscador del panel de
  // Cloudflare para encontrar la petición: si x-request-id le ganara, un
  // registro nuestro dejaría de poder cruzarse con el del borde.
  it("cf-ray le gana a x-request-id cuando llegan los dos", () => {
    expect(idDePeticion(req({ "cf-ray": "abc-LIM", "x-request-id": "r-9" }))).toBe("abc-LIM")
  })

  it("genera uno si no hay ninguno, y no se repite", () => {
    const a = idDePeticion(req())
    const b = idDePeticion(req())
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

import { describe, it, expect } from "vitest"
import { clasificarClaves, VENTANA_DE_GRACIA_MS } from "./cleanup-orphans"

const BASE = "https://pub-abc.r2.dev"
const AHORA = Date.parse("2026-08-15T12:00:00Z")

const haceDias = (d: number) => new Date(AHORA - d * 24 * 60 * 60 * 1000).toISOString()

function clasificar(over: Partial<Parameters<typeof clasificarClaves>[0]> = {}) {
  return clasificarClaves({
    claves: [],
    urlPublicaBase: BASE,
    haystack: "[]",
    activos: new Map(),
    ahora: AHORA,
    ...over,
  })
}

describe("clasificarClaves — capa 1: contenido en uso", () => {
  it("un archivo referenciado desde el contenido nunca es huérfano", () => {
    const r = clasificar({
      claves: ["audio/uno.mp3"],
      haystack: JSON.stringify([{ url: `${BASE}/audio/uno.mp3` }]),
      // Fila antigua: sin la regla de contenido caería como huérfano.
      activos: new Map([["audio/uno.mp3", haceDias(400)]]),
    })
    expect(r.enUso).toEqual(["audio/uno.mp3"])
    expect(r.huerfanas).toEqual([])
  })

  it("tolera una base con barra final sin duplicarla", () => {
    const r = clasificar({
      claves: ["audio/uno.mp3"],
      urlPublicaBase: `${BASE}/`,
      haystack: `${BASE}/audio/uno.mp3`,
    })
    expect(r.enUso).toEqual(["audio/uno.mp3"])
  })

  it("no confunde un archivo con otro cuyo nombre lo contiene como prefijo", () => {
    // "audio/a.mp3" no debe darse por usado porque exista "audio/a.mp3.bak".
    const r = clasificar({
      claves: ["audio/a.mp3.bak"],
      haystack: `${BASE}/audio/a.mp3`,
      activos: new Map([["audio/a.mp3.bak", haceDias(30)]]),
    })
    expect(r.huerfanas).toEqual(["audio/a.mp3.bak"])
  })
})

describe("clasificarClaves — capa 2: ventana de gracia (P-05)", () => {
  it("un archivo subido hoy y todavía sin publicar NO se borra", () => {
    // El caso exacto del plan: subir un archivo, no publicarlo, correr la
    // limpieza como admin, y que el archivo siga ahí.
    const r = clasificar({
      claves: ["images/recien.webp"],
      activos: new Map([["images/recien.webp", haceDias(0)]]),
    })
    expect(r.protegidasPorGracia).toEqual(["images/recien.webp"])
    expect(r.huerfanas).toEqual([])
  })

  it("protege hasta el límite de la ventana y borra pasado el límite", () => {
    const justoDentro = new Date(AHORA - VENTANA_DE_GRACIA_MS + 1000).toISOString()
    const justoFuera = new Date(AHORA - VENTANA_DE_GRACIA_MS - 1000).toISOString()

    expect(clasificar({ claves: ["k"], activos: new Map([["k", justoDentro]]) }).protegidasPorGracia).toEqual(["k"])
    expect(clasificar({ claves: ["k"], activos: new Map([["k", justoFuera]]) }).huerfanas).toEqual(["k"])
  })

  it("una fecha ilegible se trata como recién subido, no como antigua", () => {
    const r = clasificar({ claves: ["k"], activos: new Map([["k", "no-es-una-fecha"]]) })
    expect(r.protegidasPorGracia).toEqual(["k"])
    expect(r.huerfanas).toEqual([])
  })

  it("respeta una ventana personalizada", () => {
    const r = clasificar({
      claves: ["k"],
      activos: new Map([["k", haceDias(10)]]),
      ventanaGraciaMs: 30 * 24 * 60 * 60 * 1000,
    })
    expect(r.protegidasPorGracia).toEqual(["k"])
  })
})

describe("clasificarClaves — capa 3: atribución obligatoria", () => {
  it("por defecto, un archivo sin fila en media_assets NO se borra", () => {
    const r = clasificar({ claves: ["audio/legado.mpeg"] })
    expect(r.sinAtribuir).toEqual(["audio/legado.mpeg"])
    expect(r.huerfanas).toEqual([])
  })

  it("con incluirSinAtribuir sí entra al borrado (limpieza de históricos)", () => {
    const r = clasificar({ claves: ["audio/legado.mpeg"], incluirSinAtribuir: true })
    expect(r.huerfanas).toEqual(["audio/legado.mpeg"])
    expect(r.sinAtribuir).toEqual([])
  })

  it("incluirSinAtribuir NO anula las otras dos capas", () => {
    const r = clasificar({
      claves: ["usado", "reciente", "viejo"],
      haystack: `${BASE}/usado`,
      activos: new Map([
        ["reciente", haceDias(1)],
        ["viejo", haceDias(90)],
      ]),
      incluirSinAtribuir: true,
    })
    expect(r.enUso).toEqual(["usado"])
    expect(r.protegidasPorGracia).toEqual(["reciente"])
    expect(r.huerfanas).toEqual(["viejo"])
  })
})

describe("clasificarClaves — invariantes", () => {
  it("cada clave cae en exactamente un cubo y no se pierde ninguna", () => {
    const claves = ["a", "b", "c", "d", "e"]
    const r = clasificar({
      claves,
      haystack: `${BASE}/a`,
      activos: new Map([
        ["b", haceDias(1)],
        ["c", haceDias(90)],
        ["d", haceDias(365)],
      ]),
    })
    const todas = [...r.enUso, ...r.protegidasPorGracia, ...r.sinAtribuir, ...r.huerfanas]
    expect(todas.sort()).toEqual(claves)
    expect(new Set(todas).size).toBe(claves.length)
  })

  it("sin claves devuelve todo vacío", () => {
    expect(clasificar()).toEqual({ enUso: [], protegidasPorGracia: [], sinAtribuir: [], huerfanas: [] })
  })
})

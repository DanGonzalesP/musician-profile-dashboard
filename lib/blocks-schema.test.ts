import { describe, it, expect, afterEach, vi } from "vitest"
import {
  validarBloqueParaPersistir,
  validarLoteDePublicacion,
  evaluarLoteSegunModo,
  modoValidacion,
  enlacesPeligrosos,
  profundidad,
  TIPOS_DE_BLOQUE_VALIDOS,
  MAX_BLOQUES_POR_LOTE,
  MAX_PROFUNDIDAD,
} from "./blocks-schema"
import { KNOWN_BLOCK_TYPES, BLOCK_LIBRARY, defaultData, createBlock, type BlockType } from "./blocks"
import { sanitizeUrlFields } from "./safe-url"

const bloque = (over: Record<string, unknown> = {}) => ({
  block_type: "hero",
  position_index: 0,
  content: { name: "Ana" },
  ...over,
})

describe("PRUEBA DE NO REGRESIÓN — los bloques reales se publican", () => {
  // Es EL criterio de aceptación de F3: "publicar un perfil con cada tipo de
  // bloque existente y verificar que ninguno es rechazado. Si uno lo es, el
  // validador está mal, no el contenido."
  const todos = KNOWN_BLOCK_TYPES

  it.each(todos)("un bloque '%s' recién creado por el editor es válido", (tipo) => {
    const b = createBlock(tipo as BlockType)
    const r = validarBloqueParaPersistir({
      block_type: b.type,
      position_index: 0,
      // El editor pasa el contenido por sanitizeUrlFields antes de persistir.
      content: sanitizeUrlFields(b.data),
    })
    expect(r).toEqual({ ok: true })
  })

  it.each(todos)("el contenido por defecto de '%s' es válido sin sanear", (tipo) => {
    const r = validarBloqueParaPersistir({
      block_type: tipo,
      position_index: 3,
      content: defaultData(tipo as BlockType),
    })
    expect(r).toEqual({ ok: true })
  })

  it("un perfil completo con TODOS los tipos a la vez publica", () => {
    const lote = todos.map((tipo, i) => ({
      block_type: tipo,
      position_index: i,
      content: sanitizeUrlFields(defaultData(tipo as BlockType)),
    }))
    expect(validarLoteDePublicacion(lote)).toEqual({ ok: true })
  })

  it("la lista canónica cubre toda la librería de bloques más 'embeds'", () => {
    // Si BLOCK_LIBRARY crece y nadie actualiza la lista, esta prueba avisa
    // ANTES de que la base rechace un bloque legítimo.
    for (const def of BLOCK_LIBRARY) expect(TIPOS_DE_BLOQUE_VALIDOS.has(def.type)).toBe(true)
    expect(TIPOS_DE_BLOQUE_VALIDOS.has("embeds")).toBe(true)
    expect(TIPOS_DE_BLOQUE_VALIDOS.size).toBe(BLOCK_LIBRARY.length + 1)
  })
})

describe("validarBloqueParaPersistir — lo que sí rechaza", () => {
  it("un block_type inventado", () => {
    const r = validarBloqueParaPersistir(bloque({ block_type: "lo-que-sea" }))
    expect(r.ok).toBe(false)
    expect((r as { errores: string[] }).errores[0]).toContain("Tipo de bloque desconocido")
  })

  it("un block_type que no es texto", () => {
    for (const v of [null, 42, {}, ["hero"], undefined]) {
      expect(validarBloqueParaPersistir(bloque({ block_type: v })).ok).toBe(false)
    }
  })

  it("un position_index negativo, fraccionario o no numérico", () => {
    for (const v of [-1, 1.5, "0", null, NaN, Infinity]) {
      expect(validarBloqueParaPersistir(bloque({ position_index: v })).ok).toBe(false)
    }
  })

  it("acepta position_index = 0 y enteros grandes", () => {
    expect(validarBloqueParaPersistir(bloque({ position_index: 0 })).ok).toBe(true)
    expect(validarBloqueParaPersistir(bloque({ position_index: 999 })).ok).toBe(true)
  })

  it("un content que no es objeto", () => {
    for (const v of [null, "texto", 5, [], true]) {
      const r = validarBloqueParaPersistir(bloque({ content: v }))
      expect(r.ok).toBe(false)
      expect((r as { errores: string[] }).errores.join(" ")).toContain("debe ser un objeto")
    }
  })

  it("un bloque que ni siquiera es un objeto", () => {
    expect(validarBloqueParaPersistir("hola").ok).toBe(false)
    expect(validarBloqueParaPersistir(null).ok).toBe(false)
    expect(validarBloqueParaPersistir([]).ok).toBe(false)
  })

  it("acumula todos los problemas en vez de parar en el primero", () => {
    const r = validarBloqueParaPersistir({ block_type: "x", position_index: -1, content: 3 })
    expect(r.ok).toBe(false)
    expect((r as { errores: string[] }).errores).toHaveLength(3)
  })

  it("un contenido anidado más allá del tope", () => {
    let hondo: Record<string, unknown> = { fin: 1 }
    for (let i = 0; i < MAX_PROFUNDIDAD + 3; i++) hondo = { n: hondo }
    expect(validarBloqueParaPersistir(bloque({ content: hondo })).ok).toBe(false)
  })

  it("un contenido enorme", () => {
    const r = validarBloqueParaPersistir(bloque({ content: { bio: "x".repeat(600 * 1024) } }))
    expect(r.ok).toBe(false)
    expect((r as { errores: string[] }).errores.join(" ")).toContain("supera el máximo")
  })
})

describe("enlaces peligrosos — defensa en profundidad con safe-url", () => {
  it("rechaza javascript: en un campo de enlace", () => {
    const r = validarBloqueParaPersistir(
      bloque({ content: { socials: [{ platform: "instagram", href: "javascript:alert(1)" }] } })
    )
    expect(r.ok).toBe(false)
    expect((r as { errores: string[] }).errores.join(" ")).toContain("socials[0].href")
  })

  it("rechaza data:text/html y javascript: en un campo de media", () => {
    expect(
      validarBloqueParaPersistir(bloque({ content: { image: "data:text/html;base64,PHNjcmlwdD4=" } })).ok
    ).toBe(false)
    expect(validarBloqueParaPersistir(bloque({ content: { cover: "javascript:alert(1)" } })).ok).toBe(false)
  })

  it("no se deja engañar por caracteres de control dentro del esquema", () => {
    expect(
      validarBloqueParaPersistir(bloque({ content: { audioUrl: "java\tscript:alert(1)" } })).ok
    ).toBe(false)
    expect(validarBloqueParaPersistir(bloque({ content: { href: "  JavaScript:alert(1)" } })).ok).toBe(false)
  })

  it("acepta lo que el editor genera de verdad: https, relativas, mailto, tel, data:image", () => {
    const contenidoReal = {
      image: "https://pub-abc.r2.dev/images/x.webp",
      banner: "/placeholder.svg",
      contactUrl: "mailto:ana@ejemplo.com",
      url: "tel:+51999999999",
      cover: "data:image/png;base64,iVBORw0KGgo=",
      audioUrl: "https://pub-abc.r2.dev/audio/x.mp3",
    }
    expect(validarBloqueParaPersistir(bloque({ content: contenidoReal })).ok).toBe(true)
  })

  it("un campo de texto libre puede decir 'javascript:' sin que se rechace", () => {
    // `tagline` no es ni enlace ni media: es prosa del artista, y el render la
    // escapa como texto. Rechazarla sería el validador estricto que rompe
    // perfiles reales.
    expect(
      validarBloqueParaPersistir(bloque({ content: { tagline: "Toco javascript: el musical" } })).ok
    ).toBe(true)
  })

  it("una cadena vacía en un campo de enlace no es peligrosa", () => {
    expect(validarBloqueParaPersistir(bloque({ content: { image: "", href: "  " } })).ok).toBe(true)
  })

  it("enlacesPeligrosos devuelve la ruta exacta, anidada", () => {
    const rutas = enlacesPeligrosos({ albums: [{ tracks: [{ audioUrl: "javascript:x" }] }] })
    expect(rutas).toEqual(["content.albums[0].tracks[0].audioUrl"])
  })
})

describe("profundidad", () => {
  it("cuenta el anidamiento de objetos y arreglos", () => {
    expect(profundidad({ a: 1 })).toBe(1)
    expect(profundidad({ a: { b: 1 } })).toBe(2)
    expect(profundidad({ a: [{ b: 1 }] })).toBe(3)
    expect(profundidad("texto")).toBe(0)
  })

  it("corta en el tope en vez de recorrer una estructura enorme", () => {
    let hondo: Record<string, unknown> = {}
    for (let i = 0; i < 500; i++) hondo = { n: hondo }
    expect(profundidad(hondo, 10)).toBe(10)
  })
})

describe("validarLoteDePublicacion", () => {
  it("acepta un lote vacío (un perfil puede quedarse sin bloques)", () => {
    expect(validarLoteDePublicacion([])).toEqual({ ok: true })
  })

  it("rechaza si no es un arreglo", () => {
    expect(validarLoteDePublicacion({ block_type: "hero" }).ok).toBe(false)
    expect(validarLoteDePublicacion(null).ok).toBe(false)
  })

  it("rechaza el lote ENTERO si un solo bloque falla, e indica cuál", () => {
    const lote = [bloque(), bloque({ block_type: "inventado" }), bloque()]
    const r = validarLoteDePublicacion(lote)
    expect(r.ok).toBe(false)
    expect((r as { indicesInvalidos: number[] }).indicesInvalidos).toEqual([1])
    expect((r as { errores: string[] }).errores[0]).toContain("Bloque 2")
  })

  it("rechaza un lote con demasiados bloques", () => {
    const lote = Array.from({ length: MAX_BLOQUES_POR_LOTE + 1 }, () => bloque())
    expect(validarLoteDePublicacion(lote).ok).toBe(false)
  })
})

describe("modo observación — la mitigación del riesgo más alto del plan", () => {
  const original = process.env.NEXT_PUBLIC_VALIDACION_BLOQUES
  afterEach(() => {
    process.env.NEXT_PUBLIC_VALIDACION_BLOQUES = original
  })

  it("por defecto observa: NO frena la publicación", () => {
    delete process.env.NEXT_PUBLIC_VALIDACION_BLOQUES
    expect(modoValidacion()).toBe("observar")
    const registrar = vi.fn()
    expect(evaluarLoteSegunModo([bloque({ block_type: "inventado" })], registrar)).toBeNull()
    expect(registrar).toHaveBeenCalledOnce()
    expect(registrar.mock.calls[0][0]).toContain("observacion")
  })

  it("cualquier valor que no sea 'rechazar' sigue siendo observación", () => {
    for (const v of ["observar", "si", "true", ""]) {
      process.env.NEXT_PUBLIC_VALIDACION_BLOQUES = v
      expect(modoValidacion()).toBe("observar")
    }
  })

  it("con 'rechazar' devuelve un mensaje para el toast que ya existe", () => {
    process.env.NEXT_PUBLIC_VALIDACION_BLOQUES = "rechazar"
    const mensaje = evaluarLoteSegunModo([bloque({ block_type: "inventado" })], vi.fn())
    expect(mensaje).toContain("Tipo de bloque desconocido")
  })

  it("con varios errores resume en un solo mensaje legible", () => {
    process.env.NEXT_PUBLIC_VALIDACION_BLOQUES = "rechazar"
    const mensaje = evaluarLoteSegunModo(
      [bloque({ block_type: "x" }), bloque({ position_index: -5 })],
      vi.fn()
    )
    expect(mensaje).toContain("y 1 problema(s) más")
  })

  it("un lote válido nunca frena ni registra, en ninguno de los dos modos", () => {
    const registrar = vi.fn()
    for (const modo of ["observar", "rechazar"]) {
      process.env.NEXT_PUBLIC_VALIDACION_BLOQUES = modo
      expect(evaluarLoteSegunModo([bloque()], registrar)).toBeNull()
    }
    expect(registrar).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from "vitest"
import {
  LONGITUD_MINIMA_CONTRASENA,
  urlDeRetornoDeRecuperacion,
  validarContrasenaNueva,
} from "./recuperar-contrasena"

// Recuperación de contraseña — la lógica que decide si una contraseña nueva se
// acepta, y a dónde vuelve el usuario desde el correo.
//
// Se prueba aquí y no en E2E porque son reglas puras: no necesitan navegador ni
// red, y son justo las que no deben aflojarse por accidente en un refactor.

describe("validarContrasenaNueva", () => {
  it("acepta una contraseña larga que coincide", () => {
    expect(validarContrasenaNueva("caballo-correcto", "caballo-correcto")).toBeNull()
  })

  it("rechaza una más corta que el mínimo", () => {
    expect(validarContrasenaNueva("corta1", "corta1")).toBe("corta")
  })

  it("rechaza cuando no coinciden", () => {
    expect(validarContrasenaNueva("contrasena-larga", "contrasena-larja")).toBe("no-coincide")
  })

  // El orden de las comprobaciones no es cosmético: si una contraseña corta se
  // escribe igual en los dos campos, "no coinciden" sería un mensaje FALSO y
  // el usuario corregiría lo que no está mal.
  it("informa de la longitud antes que de la coincidencia", () => {
    expect(validarContrasenaNueva("corta", "corta")).toBe("corta")
    expect(validarContrasenaNueva("corta", "otra")).toBe("corta")
  })

  it("el límite es inclusivo: el mínimo exacto pasa", () => {
    const justa = "a".repeat(LONGITUD_MINIMA_CONTRASENA)
    expect(validarContrasenaNueva(justa, justa)).toBeNull()

    const unaMenos = "a".repeat(LONGITUD_MINIMA_CONTRASENA - 1)
    expect(validarContrasenaNueva(unaMenos, unaMenos)).toBe("corta")
  })

  // Los espacios cuentan como caracteres y no se recortan: una frase de paso
  // es una contraseña legítima, y recortarla en silencio haría que el usuario
  // guardara algo distinto de lo que escribió.
  it("no recorta espacios ni los descuenta de la longitud", () => {
    expect(validarContrasenaNueva("  a  b  ", "  a  b  ")).toBeNull()
    expect(validarContrasenaNueva("  a  b  ", "a b")).toBe("no-coincide")
  })

  it("una contraseña vacía nunca pasa", () => {
    expect(validarContrasenaNueva("", "")).toBe("corta")
  })
})

describe("urlDeRetornoDeRecuperacion", () => {
  it("apunta a /nueva-contrasena", () => {
    expect(urlDeRetornoDeRecuperacion()).toMatch(/\/nueva-contrasena$/)
  })

  it("es absoluta: Supabase la compara contra su lista blanca", () => {
    expect(urlDeRetornoDeRecuperacion()).toMatch(/^https?:\/\//)
  })

  // Con SITE_URL terminada en "/" la concatenación ingenua daría
  // "…//nueva-contrasena", que NO casa con la entrada de la lista blanca y
  // hace que Supabase rechace el enlace del correo.
  it("nunca produce una barra doble", () => {
    expect(urlDeRetornoDeRecuperacion()).not.toMatch(/[^:]\/\//)
  })
})

import { describe, it, expect } from "vitest"
import { slugifyUsername, isValidUsername } from "./username"

// La identidad pública de un perfil se resolvía con .ilike sobre display_name,
// que no es único y además interpretaba los comodines % y _ que llegan desde
// la URL. Estas pruebas fijan el contrato del reemplazo.

describe("isValidUsername", () => {
  it("acepta minúsculas, números y guión bajo entre 3 y 30 caracteres", () => {
    expect(isValidUsername("nova_reyes")).toBe(true)
    expect(isValidUsername("abc")).toBe(true)
    expect(isValidUsername("a1_9")).toBe(true)
    expect(isValidUsername("x".repeat(30))).toBe(true)
  })

  it("rechaza lo que rompería la URL o el índice único", () => {
    expect(isValidUsername("ab")).toBe(false) // muy corto
    expect(isValidUsername("x".repeat(31))).toBe(false) // muy largo
    expect(isValidUsername("Nova")).toBe(false) // mayúsculas
    expect(isValidUsername("nova reyes")).toBe(false) // espacio
    expect(isValidUsername("nova-reyes")).toBe(false) // guión medio
    expect(isValidUsername("josé")).toBe(false) // acento
    expect(isValidUsername("")).toBe(false)
  })

  it("rechaza los comodines de LIKE, que eran el vector de la falla vieja", () => {
    // Con el .ilike anterior, visitar /%25 hacía match con un perfil
    // arbitrario y /a%25 permitía enumerar perfiles por prefijo.
    expect(isValidUsername("%")).toBe(false)
    expect(isValidUsername("a%")).toBe(false)
    expect(isValidUsername("nova%reyes")).toBe(false)
  })
})

describe("slugifyUsername", () => {
  it("normaliza un nombre de artista a un username válido", () => {
    expect(slugifyUsername("Nova Reyes")).toBe("nova_reyes")
    expect(slugifyUsername("La Kimberly")).toBe("la_kimberly")
  })

  it("translitera acentos en vez de perder la letra", () => {
    expect(slugifyUsername("José Ramírez")).toBe("jose_ramirez")
    expect(slugifyUsername("Sonqoy Ñusta")).toBe("sonqoy_nusta")
  })

  it("descarta los caracteres que no puede representar, conservando la separación de palabras", () => {
    // El espacio se convierte en "_" ANTES de descartar los símbolos, así que
    // "DJ $hark" conserva el límite entre palabras en vez de pegarlas.
    expect(slugifyUsername("DJ $hark!!")).toBe("dj_hark")
    expect(slugifyUsername("a/b\\c")).toBe("abc")
  })

  it("colapsa separadores repetidos y recorta los de los extremos", () => {
    expect(slugifyUsername("  Nova   Reyes  ")).toBe("nova_reyes")
    expect(slugifyUsername("--Nova--Reyes--")).toBe("nova_reyes")
  })

  it("respeta el límite de 30 caracteres del formato", () => {
    const largo = slugifyUsername("Orquesta Sinfonica Nacional del Peru Filarmonica")
    expect(largo.length).toBeLessThanOrEqual(30)
    expect(isValidUsername(largo)).toBe(true)
  })

  it("produce algo válido para lo que ya es un username", () => {
    expect(slugifyUsername("nova_reyes")).toBe("nova_reyes")
  })
})

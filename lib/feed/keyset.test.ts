import { describe, it, expect } from "vitest"
import { cursorDeUltimaFila, expresionKeyset } from "./keyset"

describe("expresionKeyset — condición de paginación por cursor", () => {
  it("pide lo estrictamente anterior al cursor, con desempate por id", () => {
    const expresion = expresionKeyset({ createdAt: "2026-08-15T10:00:00.000Z", id: "42" })

    // Dos ramas: más viejo por fecha, o misma fecha con id menor. Sin la
    // segunda, dos filas del mismo milisegundo hacen que la paginación se
    // quede repitiendo el mismo bloque para siempre.
    expect(expresion).toContain('created_at.lt."2026-08-15T10:00:00.000Z"')
    expect(expresion).toContain('and(created_at.eq."2026-08-15T10:00:00.000Z",id.lt."42")')
  })

  it("no deja que un valor con comillas rompa la expresión", () => {
    const expresion = expresionKeyset({ createdAt: '2026-01-01"', id: 'a"b\\c' })
    expect(expresion).not.toContain('\\')
    // Sigue habiendo exactamente dos pares de comillas por valor.
    expect(expresion.match(/"/g)?.length).toBe(6)
  })
})

describe("cursorDeUltimaFila", () => {
  it("toma la última fila de la página", () => {
    const cursor = cursorDeUltimaFila([
      { id: 1, created_at: "2026-08-15T10:00:00.000Z" },
      { id: 2, created_at: "2026-08-14T10:00:00.000Z" },
    ])
    expect(cursor).toEqual({ createdAt: "2026-08-14T10:00:00.000Z", id: "2" })
  })

  it("devuelve null cuando la página vino vacía (no hay más contenido)", () => {
    expect(cursorDeUltimaFila([])).toBeNull()
  })

  it("devuelve null si la fila no tiene fecha: sin fecha no hay cursor honesto", () => {
    expect(cursorDeUltimaFila([{ id: 7, created_at: null }])).toBeNull()
  })
})

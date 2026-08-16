import { describe, it, expect } from "vitest"
import { esLimiteDeEscritura, mensajeDeLimite, traducirErrorDeEscritura } from "./rate-limit-errors"

// El error real que devuelve PostgREST cuando el trigger de 0011 dispara.
const errorDePostgrest = {
  code: "23514",
  message: "limite_de_escritura: demasiadas escrituras en comentarios_pista",
  details: null,
  hint: null,
}

describe("esLimiteDeEscritura", () => {
  it("reconoce el error del trigger tal como llega de PostgREST", () => {
    expect(esLimiteDeEscritura(errorDePostgrest)).toBe(true)
  })

  it("reconoce también un Error ya envuelto", () => {
    expect(esLimiteDeEscritura(new Error(errorDePostgrest.message))).toBe(true)
  })

  it("reconoce una cadena suelta", () => {
    expect(esLimiteDeEscritura(errorDePostgrest.message)).toBe(true)
  })

  it("NO confunde otros errores con el límite", () => {
    expect(esLimiteDeEscritura({ message: 'relation "feed_comments" does not exist' })).toBe(false)
    expect(esLimiteDeEscritura(new Error("new row violates row-level security policy"))).toBe(false)
    expect(esLimiteDeEscritura(null)).toBe(false)
    expect(esLimiteDeEscritura(undefined)).toBe(false)
    expect(esLimiteDeEscritura({})).toBe(false)
    expect(esLimiteDeEscritura({ message: 42 })).toBe(false)
  })
})

describe("mensajeDeLimite", () => {
  it("da un mensaje distinto y accionable por cada acción", () => {
    const mensajes = (["comentario", "pregunta", "reporte", "bloqueo"] as const).map((a) =>
      mensajeDeLimite(errorDePostgrest, a)
    )
    expect(new Set(mensajes).size).toBe(4)
    for (const m of mensajes) {
      expect(m).toBeTruthy()
      // Nunca se filtra el texto de Postgres al usuario.
      expect(m).not.toContain("limite_de_escritura")
      expect(m).not.toContain("comentarios_pista")
    }
  })

  it("devuelve null si el error no es del límite, para no secuestrar otros fallos", () => {
    expect(mensajeDeLimite(new Error("otra cosa"), "comentario")).toBeNull()
  })
})

describe("traducirErrorDeEscritura", () => {
  it("usa el mensaje amable cuando es límite", () => {
    const m = traducirErrorDeEscritura(errorDePostgrest, "comentario", "mensaje por defecto")
    expect(m).toContain("muy rápido")
  })

  it("conserva el mensaje anterior cuando no es límite", () => {
    const m = traducirErrorDeEscritura(new Error("tabla inexistente"), "comentario", "mensaje por defecto")
    expect(m).toBe("mensaje por defecto")
  })
})

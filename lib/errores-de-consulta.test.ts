import { describe, it, expect } from "vitest"
import { esPermisoDenegado, esTablaAusente, mensajeDeErrorDeConsulta } from "./errores-de-consulta"

describe("esTablaAusente", () => {
  it("reconoce el código de Postgres y el de PostgREST", () => {
    expect(esTablaAusente({ code: "42P01" })).toBe(true)
    expect(esTablaAusente({ code: "PGRST205" })).toBe(true)
  })

  it("reconoce el mensaje cuando no viene el código", () => {
    expect(esTablaAusente({ message: 'relation "public.order_items" does not exist' })).toBe(true)
  })

  it("no confunde otros errores", () => {
    expect(esTablaAusente({ code: "23505", message: "duplicate key value" })).toBe(false)
    expect(esTablaAusente(null)).toBe(false)
    expect(esTablaAusente(undefined)).toBe(false)
  })
})

describe("esPermisoDenegado", () => {
  it("reconoce privilegio insuficiente y RLS", () => {
    expect(esPermisoDenegado({ code: "42501" })).toBe(true)
    expect(esPermisoDenegado({ message: "new row violates row-level security policy" })).toBe(true)
  })

  it("no confunde una tabla ausente con un permiso", () => {
    expect(esPermisoDenegado({ code: "42P01" })).toBe(false)
  })
})

describe("mensajeDeErrorDeConsulta", () => {
  // Lo que importa de esta función: que NUNCA se le muestre al usuario el
  // texto de Postgres. Ni el nombre de la tabla, ni el del esquema.
  const casos = [
    { code: "42P01", message: 'relation "public.order_items" does not exist' },
    { code: "42501", message: "permission denied for table donations" },
    { code: "08006", message: "connection failure to db.abcdef.supabase.co" },
  ]

  for (const error of casos) {
    it(`no filtra el detalle interno de ${error.code}`, () => {
      const salida = mensajeDeErrorDeConsulta(error, "el historial de pedidos")
      expect(salida).not.toContain("public.")
      expect(salida).not.toContain("order_items")
      expect(salida).not.toContain("donations")
      expect(salida).not.toContain("supabase.co")
      expect(salida).not.toContain("relation")
      expect(salida.length).toBeGreaterThan(10)
    })
  }

  it("dice 'todavía no está disponible' cuando la tabla no existe", () => {
    expect(mensajeDeErrorDeConsulta({ code: "42P01" }, "el historial de pedidos")).toBe(
      "El historial de pedidos todavía no está disponible en tu cuenta."
    )
  })

  it("cae a un mensaje genérico ante un error desconocido", () => {
    expect(mensajeDeErrorDeConsulta({ code: "08006" }, "los aportes recibidos")).toContain(
      "No se pudo cargar los aportes recibidos"
    )
  })
})

import { describe, it, expect } from "vitest"
import { esRutaProtegida } from "./protected-routes"

// El proxy del borde (proxy.ts) usa esta función para decidir a quién manda a
// /login. Un cambio accidental aquí abre datos privados o rompe el acceso al
// panel, así que el contrato queda fijado.

describe("esRutaProtegida", () => {
  it("protege las secciones privadas y sus subrutas", () => {
    for (const p of ["/dashboard", "/perfil", "/perfil/config", "/perfil/admin-musica", "/grupo", "/grupo/123", "/cleanup"]) {
      expect(esRutaProtegida(p), p).toBe(true)
    }
  })

  it("deja pasar lo público: home, login, perfiles de artista y estáticos", () => {
    for (const p of ["/", "/login", "/legal", "/legal/privacidad", "/nova_reyes", "/nova_reyes/tienda", "/sitemap.xml"]) {
      expect(esRutaProtegida(p), p).toBe(false)
    }
  })

  it("respeta el límite por segmento (no protege por mero prefijo de texto)", () => {
    // "/perfilamiento" comparte prefijo con "/perfil" pero es otra ruta: si el
    // chequeo fuera un startsWith ingenuo, un username así quedaría bloqueado.
    expect(esRutaProtegida("/perfilamiento")).toBe(false)
    expect(esRutaProtegida("/grupos")).toBe(false)
    expect(esRutaProtegida("/dashboards")).toBe(false)
  })
})

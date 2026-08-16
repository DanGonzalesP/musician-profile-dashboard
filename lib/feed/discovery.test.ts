import { describe, it, expect } from "vitest"
import { aggregate, mapearFilasRpc, type JoinRow } from "./discovery"

// Fila mínima de producto/servicio con su perfil embebido.
function fila(over: Partial<JoinRow["profiles"]> & { is_active?: boolean; category?: string }): JoinRow {
  const { is_active, category, ...profile } = over
  return {
    is_active: is_active ?? true,
    category,
    profiles: {
      username: profile.username ?? "artista",
      display_name: profile.display_name ?? "Artista",
      profile_type: profile.profile_type ?? "artist",
      is_suspended: profile.is_suspended ?? false,
      ...profile,
    },
  }
}

describe("aggregate — descubrimiento por perfil", () => {
  it("agrupa varias filas del mismo username en una tarjeta con su conteo", () => {
    const out = aggregate(
      [
        fila({ username: "luna", category: "Guitarra" }),
        fila({ username: "luna", category: "Voz" }),
      ],
      "serv"
    )
    expect(out).toHaveLength(1)
    expect(out[0].slug).toBe("luna")
    expect(out[0].count).toBe(2)
    expect(out[0].categories.sort()).toEqual(["Guitarra", "Voz"])
  })

  it("descarta las filas inactivas", () => {
    const out = aggregate([fila({ username: "luna", is_active: false })], "prod")
    expect(out).toHaveLength(0)
  })

  // P-34, segunda capa: la suspensión debe respetarse también en el código, no
  // sólo en RLS, porque products/services no están cubiertos por la política de
  // profile_blocks de 0008.
  it("excluye del descubrimiento a un perfil suspendido aunque tenga productos", () => {
    const out = aggregate(
      [
        fila({ username: "luna" }),
        fila({ username: "sombra", is_suspended: true }),
      ],
      "prod"
    )
    expect(out.map((p) => p.slug)).toEqual(["luna"])
  })

  it("no filtra a los perfiles no suspendidos (sin cambio de comportamiento)", () => {
    const out = aggregate(
      [
        fila({ username: "luna", is_suspended: false }),
        fila({ username: "sol", is_suspended: false }),
      ],
      "serv"
    )
    expect(out.map((p) => p.slug).sort()).toEqual(["luna", "sol"])
  })
})

// El camino preferido (P-16): la agregación la hace Postgres y acá sólo se
// traduce la fila. Lo que estas pruebas fijan es que las DOS rutas —el RPC de
// la migración 0012 y el respaldo en JavaScript— producen la misma forma, que
// es lo único que impide que activar la migración cambie lo que se ve.
describe("mapearFilasRpc — descubrimiento agregado en la base", () => {
  it("traduce una fila agregada a la misma forma que `aggregate`", () => {
    const [perfil] = mapearFilasRpc(
      [
        {
          username: "luna",
          display_name: "Luna",
          profile_type: "artist",
          musician_roles: ["cantante"],
          categorias: ["Guitarra", "Voz"],
          total: 2,
        },
      ],
      "serv"
    )

    const equivalente = aggregate(
      [fila({ username: "luna", display_name: "Luna", category: "Guitarra" }),
       fila({ username: "luna", display_name: "Luna", category: "Voz" })],
      "serv"
    )[0]

    expect(perfil.slug).toBe(equivalente.slug)
    expect(perfil.profileId).toBe(equivalente.profileId)
    expect(perfil.displayName).toBe(equivalente.displayName)
    expect(perfil.count).toBe(equivalente.count)
    expect(perfil.categories.sort()).toEqual(equivalente.categories.sort())
    expect(perfil.isGroup).toBe(equivalente.isGroup)
  })

  it("ordena por conteo, de mayor a menor", () => {
    const out = mapearFilasRpc(
      [
        { username: "sol", total: 1, categorias: [] },
        { username: "luna", total: 9, categorias: [] },
      ],
      "prod"
    )
    expect(out.map((p) => p.slug)).toEqual(["luna", "sol"])
  })

  it("descarta filas sin username y tolera categorías nulas", () => {
    const out = mapearFilasRpc(
      [
        { username: "  ", total: 3, categorias: null },
        { username: "luna", total: 1, categorias: [null, "Voz", 7] as unknown as string[] },
      ],
      "prod"
    )
    expect(out).toHaveLength(1)
    expect(out[0].categories).toEqual(["Voz"])
  })

  it("marca como grupo sólo a los perfiles de tipo band", () => {
    const out = mapearFilasRpc(
      [
        { username: "banda", profile_type: "band", total: 1, categorias: [] },
        { username: "solista", profile_type: "artist", total: 1, categorias: [] },
      ],
      "serv"
    )
    expect(out.find((p) => p.slug === "banda")?.isGroup).toBe(true)
    expect(out.find((p) => p.slug === "solista")?.isGroup).toBe(false)
  })
})

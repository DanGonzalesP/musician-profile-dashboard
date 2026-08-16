import { describe, it, expect } from "vitest"
import { mapearFilasRpc } from "./discovery"

// La agregación (P-16) la hace Postgres y acá sólo se traduce la fila.
describe("mapearFilasRpc — descubrimiento agregado en la base", () => {
  it("traduce una fila agregada al contrato de la tarjeta", () => {
    const [perfil] = mapearFilasRpc(
      [
        {
          username: "luna",
          display_name: "Luna",
          profile_type: "artist",
          musician_roles: ["musicos"],
          categorias: ["Guitarra", "Voz"],
          total: 2,
        },
      ],
      "serv"
    )

    expect(perfil).toEqual({
      profileId: "serv-luna",
      displayName: "Luna",
      slug: "luna",
      roles: ["musicos"],
      isGroup: false,
      count: 2,
      categories: ["Guitarra", "Voz"],
    })
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

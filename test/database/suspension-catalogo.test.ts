import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { clienteAdministrativo, clienteAnonimo, crearPista, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

describe("suspensión en lecturas directas de PostgREST", () => {
  let artist: UsuarioDePrueba
  let visitor: UsuarioDePrueba
  beforeAll(async () => {
    artist = await crearUsuario(); visitor = await crearUsuario()
    await crearPista(artist)
    expect((await artist.supabase.from("products").insert({ seller_id: artist.profileId, title: "Ficticio", price: 10, type: "physical" })).error).toBeNull()
    expect((await artist.supabase.from("services").insert({ profile_id: artist.profileId, title: "Ficticio" })).error).toBeNull()
  })
  afterAll(async () => { await limpiarUsuarios(artist, visitor) })
  it("oculta catálogo y música a terceros, conserva gestión propia y permite restaurar", async () => {
    for (const suspended of [false, true, false]) {
      // Administración exclusivamente para configurar el fixture, nunca para leer lo probado.
      expect((await clienteAdministrativo().from("profiles").update({ is_suspended: suspended }).eq("id", artist.profileId!)).error).toBeNull()
      for (const client of [clienteAnonimo(), visitor.supabase, artist.supabase]) {
        for (const [table, column] of [["products", "seller_id"], ["services", "profile_id"], ["music_feed", "profile_id"]]) {
          const result = await client.from(table).select("id").eq(column, artist.profileId!)
          expect(result.error).toBeNull()
          expect(result.data).toHaveLength(suspended && client !== artist.supabase ? 0 : 1)
        }
      }
    }
  })
  it("el catálogo suspendido sigue visible para su borrado privado: no acumula filas al reemplazar", async () => {
    expect((await clienteAdministrativo().from("profiles").update({ is_suspended: true }).eq("id", artist.profileId!)).error).toBeNull()
    const result = await artist.supabase.from("products").delete().eq("seller_id", artist.profileId!).select("id")
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect((await artist.supabase.from("products").select("id").eq("seller_id", artist.profileId!)).data).toEqual([])
  })
})

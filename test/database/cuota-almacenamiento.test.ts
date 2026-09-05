import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  claveDeMedio,
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  type UsuarioDePrueba,
} from "./helpers"

// `uso_de_almacenamiento_bytes()` (migración 0019) es la medición sobre la que
// se apoya la cuota de almacenamiento.
//
// La función es `security invoker` justamente para no reimplementar a mano la
// restricción "sólo mis filas": se apoya en la política
// `media_assets_select_own`. Eso hay que demostrarlo contra la base real, no
// razonarlo: si alguien la cambiara a `security definer` en un refactor, la
// suma pasaría a incluir los archivos de TODO EL MUNDO y cada usuario vería su
// cuota agotada por lo que subieron los demás. Nada más lo detectaría.

const KB = 1024

describe("Cuota de almacenamiento · uso_de_almacenamiento_bytes", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Cuota" })
    beto = await crearUsuario({ nombre: "Beto Cuota" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  it("una cuenta sin archivos suma 0, no null", async () => {
    // `sum()` sobre cero filas devuelve NULL en Postgres. Si el `coalesce` de
    // la migración desapareciera, la aplicación compararía null contra el
    // límite y trataría "no ha subido nada" como un resultado desconocido.
    const { data, error } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")

    expect(error).toBeNull()
    expect(Number(data)).toBe(0)
  })

  it("suma los bytes de los archivos propios", async () => {
    for (const bytes of [10 * KB, 25 * KB]) {
      const { error } = await ana.supabase.from("media_assets").insert({
        key: claveDeMedio("images"),
        owner_user_id: ana.id,
        profile_id: ana.profileId,
        folder: "images",
        content_type: "image/webp",
        bytes,
      })
      expect(error).toBeNull()
    }

    const { data, error } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(error).toBeNull()
    expect(Number(data)).toBe(35 * KB)
  })

  // ─── La razón de ser de esta prueba ─────────────────────────────────────
  it("NO suma los archivos de otra persona", async () => {
    const { error } = await beto.supabase.from("media_assets").insert({
      key: claveDeMedio("audio"),
      owner_user_id: beto.id,
      profile_id: beto.profileId,
      folder: "audio",
      content_type: "audio/mpeg",
      bytes: 900 * KB,
    })
    expect(error).toBeNull()

    // Ana sigue viendo sólo lo suyo…
    const { data: deAna } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(Number(deAna)).toBe(35 * KB)

    // …y Beto sólo lo suyo. Si la función fuera `security definer`, los dos
    // verían 935 KB.
    const { data: deBeto } = await beto.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(Number(deBeto)).toBe(900 * KB)
  })

  it("un archivo sin tamaño registrado cuenta como 0, no rompe la suma", async () => {
    // Las filas del backfill de 0002 no tienen `bytes`. Sin el `coalesce` por
    // fila, una sola de ellas haría que toda la suma del usuario fuera NULL y
    // la cuota dejaría de medirse justo para las cuentas más antiguas.
    const { error } = await ana.supabase.from("media_assets").insert({
      key: claveDeMedio("images"),
      owner_user_id: ana.id,
      profile_id: ana.profileId,
      folder: "images",
      content_type: "image/webp",
      bytes: null,
    })
    expect(error).toBeNull()

    const { data } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(Number(data)).toBe(35 * KB)
  })

  it("un anónimo no puede llamarla", async () => {
    // El grant es sólo a `authenticated`. Una cuenta sin sesión no tiene
    // almacenamiento que consultar, y dejarla llamar sólo ampliaría la
    // superficie sin ganar nada.
    const anonimo = clienteAnonimo()
    const { error } = await anonimo.rpc("uso_de_almacenamiento_bytes")

    expect(error).toBeTruthy()
  })

  it("borrar un archivo libera cuota", async () => {
    const clave = claveDeMedio("audio")
    await ana.supabase.from("media_assets").insert({
      key: clave,
      owner_user_id: ana.id,
      profile_id: ana.profileId,
      folder: "audio",
      content_type: "audio/mpeg",
      bytes: 500 * KB,
    })

    const { data: conArchivo } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(Number(conArchivo)).toBe(535 * KB)

    await ana.supabase.from("media_assets").delete().eq("key", clave)

    const { data: sinArchivo } = await ana.supabase.rpc("uso_de_almacenamiento_bytes")
    expect(Number(sinArchivo)).toBe(35 * KB)
  })
})

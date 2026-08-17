import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  claveDeMedio,
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  type UsuarioDePrueba,
} from "./helpers"

// `media_assets` (migración 0002) es el registro de propiedad de todo lo que
// vive en R2. Antes de existir, /api/delete-file sólo comprobaba que hubiera
// sesión: cualquier autenticado borraba el archivo de otro con sólo conocer su
// URL, que es pública por diseño.
//
// Estas pruebas verifican esa frontera CON EL JWT DE CADA USUARIO, que es como
// habla la app. Si alguien comenta una de las tres políticas de 0002, algo de
// acá tiene que ponerse en rojo.

describe("RLS · media_assets", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  /** Archivo de Ana que sobrevive a todo el archivo de pruebas. */
  let claveDeAna: string

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Media" })
    beto = await crearUsuario({ nombre: "Beto Media" })

    claveDeAna = claveDeMedio("images")
    const { error } = await ana.supabase.from("media_assets").insert({
      key: claveDeAna,
      owner_user_id: ana.id,
      profile_id: ana.profileId,
      folder: "images",
      content_type: "image/webp",
      bytes: 2048,
    })
    expect(error).toBeNull()
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("propiedad al escribir", () => {
    it("A registra un archivo a su nombre y lo ve", async () => {
      const { data, error } = await ana.supabase
        .from("media_assets")
        .select("key, owner_user_id, folder, bytes")
        .eq("key", claveDeAna)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0]?.owner_user_id).toBe(ana.id)
    })

    it("A NO puede registrar un archivo a nombre de B", async () => {
      // El insert lo hace /api/upload-url con el JWT del usuario: si esta
      // política cediera, cualquiera podría atribuirle archivos a otro y
      // llenarle la cuota (o hacerle borrar los suyos).
      const clave = claveDeMedio("audio")
      const { error } = await ana.supabase.from("media_assets").insert({
        key: clave,
        owner_user_id: beto.id,
        folder: "audio",
      })

      expect(error).toBeTruthy()

      const { data } = await beto.supabase.from("media_assets").select("key").eq("key", clave)
      expect(data ?? []).toHaveLength(0)
    })

    it("B NO puede apropiarse de la clave de A", async () => {
      // La clave es la primary key: reclamarla de nuevo a nombre propio sería
      // la forma de "adoptar" el archivo de otro y ganarse el derecho a
      // borrarlo. La colisión de clave lo impide.
      const { error } = await beto.supabase.from("media_assets").insert({
        key: claveDeAna,
        owner_user_id: beto.id,
        folder: "images",
      })

      expect(error).toBeTruthy()

      const { data } = await ana.supabase
        .from("media_assets")
        .select("owner_user_id")
        .eq("key", claveDeAna)
        .single()
      expect(data?.owner_user_id).toBe(ana.id)
    })

    it("la carpeta está acotada a images/audio/video", async () => {
      const { error } = await ana.supabase.from("media_assets").insert({
        key: claveDeMedio(),
        owner_user_id: ana.id,
        folder: "../../etc",
      })
      expect(error).toBeTruthy()
    })
  })

  describe("propiedad al leer y al borrar", () => {
    it("B NO ve los archivos de A", async () => {
      // Los archivos en sí son públicos vía R2; QUIÉN subió QUÉ no lo es.
      const { data } = await beto.supabase.from("media_assets").select("*").eq("key", claveDeAna)
      expect(data ?? []).toHaveLength(0)
    })

    it("B NO puede borrar el archivo de A", async () => {
      await beto.supabase.from("media_assets").delete().eq("key", claveDeAna)

      // La comprobación la hace el dueño: si el borrado hubiera pasado, la fila
      // ya no estaría.
      const { data } = await ana.supabase.from("media_assets").select("key").eq("key", claveDeAna)
      expect(data ?? []).toHaveLength(1)
    })

    it("B NO puede reasignarse el archivo de A con un update", async () => {
      await beto.supabase
        .from("media_assets")
        .update({ owner_user_id: beto.id })
        .eq("key", claveDeAna)

      const { data } = await ana.supabase
        .from("media_assets")
        .select("owner_user_id")
        .eq("key", claveDeAna)
        .single()
      expect(data?.owner_user_id).toBe(ana.id)
    })

    it("A sí borra lo suyo", async () => {
      const clave = claveDeMedio("video")
      const { error: errorAlta } = await ana.supabase
        .from("media_assets")
        .insert({ key: clave, owner_user_id: ana.id, folder: "video" })
      expect(errorAlta).toBeNull()

      const { error } = await ana.supabase.from("media_assets").delete().eq("key", clave)
      expect(error).toBeNull()

      const { data } = await ana.supabase.from("media_assets").select("key").eq("key", clave)
      expect(data ?? []).toHaveLength(0)
    })
  })

  describe("visitante sin sesión", () => {
    it("anon no obtiene NINGUNA fila del inventario", async () => {
      const { data, error } = await clienteAnonimo().from("media_assets").select("*").limit(5)
      expect(error ? true : (data ?? []).length === 0).toBe(true)
    })

    it("anon no puede registrar ni borrar archivos", async () => {
      const anon = clienteAnonimo()

      const { error: errorInsert } = await anon
        .from("media_assets")
        .insert({ key: claveDeMedio(), owner_user_id: ana.id, folder: "images" })
      expect(errorInsert).toBeTruthy()

      await anon.from("media_assets").delete().eq("key", claveDeAna)
      const { data } = await ana.supabase.from("media_assets").select("key").eq("key", claveDeAna)
      expect(data ?? []).toHaveLength(1)
    })
  })
})

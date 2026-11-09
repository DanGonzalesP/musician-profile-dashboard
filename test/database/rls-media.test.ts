import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  claveDeMedio,
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  prepararMedioHistorico,
  type UsuarioDePrueba,
} from "./helpers"

// `media_assets` (migración 0002) es el registro de propiedad de todo lo que
// vive en R2. Antes de existir, /api/delete-file sólo comprobaba que hubiera
// sesión: cualquier autenticado borraba el archivo de otro con sólo conocer su
// URL, que es pública por diseño.
//
// Estas pruebas verifican esa frontera CON EL JWT DE CADA USUARIO, que es como
// habla la app. La lectura permanece privada;0035 cierra el CRUD directo y
// obliga a reservar/retirar por RPC con recibo. Los históricos son sólo fixtures.

describe("RLS · media_assets", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  /** Archivo de Ana que sobrevive a todo el archivo de pruebas. */
  let claveDeAna: string

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Media" })
    beto = await crearUsuario({ nombre: "Beto Media" })

    claveDeAna = claveDeMedio(ana, "images")
    await prepararMedioHistorico({
      key: claveDeAna,
      owner_user_id: ana.id,
      profile_id: ana.profileId,
      folder: "images",
      content_type: "image/webp",
      bytes: 2048,
    })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("propiedad al escribir", () => {
    it.each([0, null, 100])("no permite inventario propio sin reserva, aunque bytes sea %s", async (bytes) => {
      const key = claveDeMedio(ana)
      const result = await ana.supabase.from("media_assets").insert({
        key, owner_user_id: ana.id, profile_id: ana.profileId,
        folder: "images", content_type: "image/webp", bytes,
      })
      expect(result.error?.code).toBe("42501")
      expect((await ana.supabase.from("media_assets").select("key").eq("key", key)).data).toEqual([])
    })

    it("no permite reemplazar un histórico con UPSERT para reducir su cuota", async () => {
      const result = await ana.supabase.from("media_assets").upsert({
        key: claveDeAna, owner_user_id: ana.id, folder: "images", bytes: 0,
      })
      expect(result.error?.code).toBe("42501")
      expect((await ana.supabase.from("media_assets").select("bytes").eq("key", claveDeAna).single()).data?.bytes).toBe(2048)
    })

    it("no permite cambiar tamaño ni atribución de un histórico propio", async () => {
      const before = await ana.supabase.from("media_assets").select("*").eq("key", claveDeAna).single()
      expect(before.error).toBeNull()
      for (const patch of [{ bytes: 0 }, { owner_user_id: beto.id }, { profile_id: beto.profileId }]) {
        const result = await ana.supabase.from("media_assets").update(patch).eq("key", claveDeAna).select("*")
        expect(result.error?.code).toBe("42501")
        expect(await ana.supabase.from("media_assets").select("*").eq("key", claveDeAna).single())
          .toMatchObject({ error: null, data: before.data })
      }
    })

    it("no permite inventar propiedad de una key histórica sin fila", async () => {
      const key = `images/legado-${crypto.randomUUID()}.webp`
      const result = await ana.supabase.from("media_assets").insert({ key, owner_user_id: ana.id, folder: "images" })
      expect(result.error).toBeTruthy()
      expect((await ana.supabase.from("media_assets").select("key").eq("key", key)).data).toEqual([])
    })

    it("no registra una key del namespace ajeno aunque todavía no exista", async () => {
      const result = await ana.supabase.from("media_assets").insert({ key: claveDeMedio(beto), owner_user_id: ana.id, folder: "images" })
      expect(result.error).toBeTruthy()
    })

    it("no atribuye sus subidas a un perfil que no administra", async () => {
      const result = await ana.supabase.from("media_assets").insert({ key: claveDeMedio(ana), owner_user_id: ana.id, folder: "images", profile_id: beto.profileId })
      expect(result.error).toBeTruthy()
    })

    it("A puede consultar su inventario histórico", async () => {
      const { data, error } = await ana.supabase
        .from("media_assets")
        .select("key, owner_user_id, folder, bytes")
        .eq("key", claveDeAna)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0]?.owner_user_id).toBe(ana.id)
    })

    it("A NO puede registrar un archivo a nombre de B", async () => {
      // Incluso un cliente antiguo queda denegado antes de atribuir inventario.
      const clave = claveDeMedio(ana, "audio")
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
      // El cliente no puede apropiarse de una key conocida mediante INSERT.
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

    it("un INSERT con carpeta inválida también queda denegado", async () => {
      const { error } = await ana.supabase.from("media_assets").insert({
        key: claveDeMedio(ana),
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

    it("A tampoco puede borrar su inventario histórico directamente", async () => {
      const clave = claveDeMedio(ana, "video")
      await prepararMedioHistorico({ key: clave, owner_user_id: ana.id, folder: "video" })

      const { error } = await ana.supabase.from("media_assets").delete().eq("key", clave)
      expect(error?.code).toBe("42501")

      const { data } = await ana.supabase.from("media_assets").select("key").eq("key", clave)
      expect(data ?? []).toHaveLength(1)
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
        .insert({ key: claveDeMedio(ana), owner_user_id: ana.id, folder: "images" })
      expect(errorInsert).toBeTruthy()

      await anon.from("media_assets").delete().eq("key", claveDeAna)
      const { data } = await ana.supabase.from("media_assets").select("key").eq("key", claveDeAna)
      expect(data ?? []).toHaveLength(1)
    })
  })
})

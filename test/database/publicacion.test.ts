import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  mensajeDeError,
  type UsuarioDePrueba,
} from "./helpers"

// `publish_profile` (0005 → 0007 → v3 en 0010) es la única escritura masiva del
// proyecto: borra todos los bloques del perfil y los vuelve a insertar. Tres
// promesas la sostienen, y las tres se prueban aquí como conducta:
//
//   1. ATÓMICA — un lote con un bloque inválido no deja el perfil vacío ni
//      pierde el borrador. La validación va ANTES del `delete`.
//   2. VERSIÓN OPTIMISTA — dos publicaciones simultáneas no se pisan: la
//      segunda recibe `conflicto_de_version` en vez de sobrescribir.
//   3. DEL DUEÑO — es `security invoker`, así que RLS decide. Nadie publica el
//      perfil de otro.
//
// La lista canónica de tipos tiene que coincidir con KNOWN_BLOCK_TYPES de
// lib/blocks.ts y con la restricción `profile_blocks_block_type_valido`.

const TIPOS_CANONICOS = [
  "hero",
  "single",
  "crowdfunding",
  "tracks",
  "credits",
  "merch",
  "service",
  "legado",
  "publicaciones",
  "embeds",
] as const

function bloque(tipo: string, posicion: number, contenido: Record<string, unknown> = {}) {
  return { block_type: tipo, position_index: posicion, content: contenido }
}

describe("publish_profile", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Publicación" })
    beto = await crearUsuario({ nombre: "Beto Publicación" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  /** Lo que ve el mundo: se lee sin sesión, como el perfil público. */
  async function bloquesPublicos(profileId: string) {
    const { data } = await clienteAnonimo()
      .from("profile_blocks")
      .select("block_type, position_index, content")
      .eq("profile_id", profileId)
      .order("position_index", { ascending: true })
    return data ?? []
  }

  async function versionDe(usuario: UsuarioDePrueba): Promise<number> {
    const { data, error } = await usuario.supabase
      .from("profiles")
      .select("content_version")
      .eq("id", usuario.profileId!)
      .single()
    expect(error).toBeNull()
    return data!.content_version as number
  }

  async function publicar(
    usuario: UsuarioDePrueba,
    bloques: unknown,
    opciones: { perfil?: string; version?: number | null } = {}
  ) {
    return usuario.supabase.rpc("publish_profile", {
      p_profile_id: opciones.perfil ?? usuario.profileId,
      p_blocks: bloques,
      p_expected_version: opciones.version ?? null,
    })
  }

  describe("el camino feliz", () => {
    it("A publica su perfil y la base devuelve la versión nueva", async () => {
      const version = await versionDe(ana)

      const { data, error } = await publicar(
        ana,
        [bloque("hero", 0, { titulo: "Ana en vivo" }), bloque("tracks", 1, { pistas: [] })],
        { version }
      )

      expect(error).toBeNull()
      expect(data).toBe(version + 1)
      expect(await versionDe(ana)).toBe(version + 1)

      const publicados = await bloquesPublicos(ana.profileId!)
      expect(publicados.map((b) => b.block_type)).toEqual(["hero", "tracks"])
      expect(publicados[0]?.content).toEqual({ titulo: "Ana en vivo" })
    })

    it("acepta los diez tipos de bloque canónicos (no regresión del validador)", async () => {
      // Si uno solo fuera rechazado, el validador estaría mal, no el contenido:
      // el usuario perdería un bloque que el editor sí ofrece.
      const lote = TIPOS_CANONICOS.map((tipo, i) => bloque(tipo, i, { nota: `bloque ${tipo}` }))

      const { error } = await publicar(ana, lote, { version: await versionDe(ana) })
      expect(error, mensajeDeError(error)).toBeNull()

      const publicados = await bloquesPublicos(ana.profileId!)
      expect(publicados.map((b) => b.block_type)).toEqual([...TIPOS_CANONICOS])
    })

    it("publicar sin versión esperada sigue funcionando (pestaña abierta durante el despliegue)", async () => {
      const version = await versionDe(ana)
      const { data, error } = await publicar(ana, [bloque("hero", 0, { titulo: "Sin versión" })])

      expect(error).toBeNull()
      expect(data).toBe(version + 1)
    })
  })

  describe("nadie publica el perfil de otro", () => {
    beforeAll(async () => {
      const { error } = await publicar(beto, [bloque("hero", 0, { titulo: "Perfil de Beto" })], {
        version: await versionDe(beto),
      })
      expect(error).toBeNull()
    })

    it("A NO puede publicar en el perfil de B", async () => {
      const antes = await bloquesPublicos(beto.profileId!)
      const versionAntes = await versionDe(beto)

      const { error } = await publicar(ana, [bloque("hero", 0, { titulo: "Secuestrado por Ana" })], {
        perfil: beto.profileId,
      })

      expect(error).toBeTruthy()
      expect(await bloquesPublicos(beto.profileId!)).toEqual(antes)
      expect(await versionDe(beto)).toBe(versionAntes)
    })

    it("A tampoco puede borrar los bloques de B por la puerta de atrás", async () => {
      // El RPC es `security invoker` justamente para que la RLS de
      // profile_blocks siga mandando en cada operación suelta.
      const antes = await bloquesPublicos(beto.profileId!)

      await ana.supabase.from("profile_blocks").delete().eq("profile_id", beto.profileId!)
      expect(await bloquesPublicos(beto.profileId!)).toEqual(antes)

      const { error } = await ana.supabase.from("profile_blocks").insert({
        profile_id: beto.profileId,
        block_type: "hero",
        position_index: 99,
        content: { titulo: "Bloque intruso" },
      })
      expect(error).toBeTruthy()
    })

    it("un visitante sin sesión no puede publicar nada", async () => {
      const { error } = await clienteAnonimo().rpc("publish_profile", {
        p_profile_id: ana.profileId,
        p_blocks: [bloque("hero", 0, {})],
      })
      expect(error).toBeTruthy()
    })
  })

  describe("atomicidad — todo o nada", () => {
    beforeAll(async () => {
      await ana.supabase.from("profile_private").upsert({
        profile_id: ana.profileId!,
        draft_content: { bloques: ["borrador que no se debe perder"] },
      })
    })

    it("un lote con un bloque inválido no deja el perfil vacío", async () => {
      const antes = await bloquesPublicos(ana.profileId!)
      expect(antes.length).toBeGreaterThan(0)
      const versionAntes = await versionDe(ana)

      const { error } = await publicar(
        ana,
        [bloque("hero", 0, { titulo: "Válido" }), bloque("lo-que-sea", 1, {})],
        { version: versionAntes }
      )

      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
      expect(await bloquesPublicos(ana.profileId!)).toEqual(antes)
      expect(await versionDe(ana)).toBe(versionAntes)
    })

    it("un lote rechazado tampoco se lleva el borrador por delante", async () => {
      const { data } = await ana.supabase
        .from("profile_private")
        .select("draft_content")
        .eq("profile_id", ana.profileId!)
        .single()

      expect(data?.draft_content).toEqual({ bloques: ["borrador que no se debe perder"] })
    })

    it("una publicación buena limpia el borrador en la MISMA transacción", async () => {
      const { error } = await publicar(ana, [bloque("hero", 0, { titulo: "Publicado de verdad" })], {
        version: await versionDe(ana),
      })
      expect(error).toBeNull()

      const { data } = await ana.supabase
        .from("profile_private")
        .select("draft_content")
        .eq("profile_id", ana.profileId!)
        .single()
      expect(data?.draft_content).toBeNull()
    })
  })

  describe("concurrencia — versión optimista", () => {
    it("la versión obsoleta es rechazada", async () => {
      const version = await versionDe(ana)

      const { error: primera } = await publicar(ana, [bloque("hero", 0, { intento: "primera" })], {
        version,
      })
      expect(primera).toBeNull()

      const { error: segunda } = await publicar(ana, [bloque("hero", 0, { intento: "segunda" })], {
        version, // ya obsoleta
      })
      expect(segunda).toBeTruthy()
      expect(mensajeDeError(segunda)).toContain("conflicto_de_version")

      const publicados = await bloquesPublicos(ana.profileId!)
      expect(publicados[0]?.content).toEqual({ intento: "primera" })
    })

    it("de dos publicaciones simultáneas con la misma versión, gana exactamente una", async () => {
      // Es la prueba del `for update` de 0007: sin él, las dos leerían la misma
      // versión y la segunda sobrescribiría a la primera sin avisar.
      const version = await versionDe(ana)

      const resultados = await Promise.all([
        publicar(ana, [bloque("hero", 0, { intento: "simultánea A" })], { version }),
        publicar(ana, [bloque("hero", 0, { intento: "simultánea B" })], { version }),
      ])

      const exitos = resultados.filter((r) => r.error === null)
      const fallos = resultados.filter((r) => r.error !== null)

      expect(exitos).toHaveLength(1)
      expect(fallos).toHaveLength(1)
      expect(mensajeDeError(fallos[0]!.error)).toContain("conflicto_de_version")
      expect(await versionDe(ana)).toBe(version + 1)

      const publicados = await bloquesPublicos(ana.profileId!)
      expect(publicados).toHaveLength(1)
    })
  })

  describe("esquema — la base valida aunque el editor no lo haga", () => {
    it("rechaza un tipo de bloque desconocido", async () => {
      const { error } = await publicar(ana, [bloque("licencia-vieja", 0, {})])
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
    })

    it("rechaza un bloque sin tipo", async () => {
      const { error } = await publicar(ana, [{ position_index: 0, content: {} }])
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
    })

    it("rechaza una posición negativa o no entera", async () => {
      const { error: negativa } = await publicar(ana, [bloque("hero", -1, {})])
      expect(mensajeDeError(negativa)).toContain("bloques_invalidos")

      const { error: fraccion } = await publicar(ana, [
        { block_type: "hero", position_index: 1.5, content: {} },
      ])
      expect(mensajeDeError(fraccion)).toContain("bloques_invalidos")
    })

    it("rechaza un `content` que no sea objeto", async () => {
      const { error } = await publicar(ana, [
        { block_type: "hero", position_index: 0, content: [1, 2, 3] },
      ])
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
    })

    it("rechaza un elemento del lote que no sea un objeto", async () => {
      const { error } = await publicar(ana, ["esto no es un bloque"])
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
    })

    it("rechaza un lote que no sea un arreglo", async () => {
      const { error } = await publicar(ana, { hero: true })
      expect(error).toBeTruthy()
    })

    it("rechaza un lote de más de 200 bloques", async () => {
      const lote = Array.from({ length: 201 }, (_, i) => bloque("hero", i, {}))
      const { error } = await publicar(ana, lote)
      expect(mensajeDeError(error)).toContain("bloques_invalidos")
    })

    it("el perfil sobrevive intacto a todos los lotes rechazados", async () => {
      const publicados = await bloquesPublicos(ana.profileId!)
      expect(publicados).toHaveLength(1)
      expect(publicados[0]?.block_type).toBe("hero")
    })
  })

  describe("esquema — la restricción también protege la escritura directa", () => {
    // Lo que el plan pide en F3 y llega completo aquí: un `insert` directo por
    // PostgREST, saltándose el RPC y el editor, tiene que ser rechazado por la
    // base. Es la segunda capa de la defensa en profundidad.

    it("un insert directo con block_type inventado es rechazado", async () => {
      const { error } = await ana.supabase.from("profile_blocks").insert({
        profile_id: ana.profileId,
        block_type: "lo-que-sea",
        position_index: 0,
        content: {},
      })
      expect(error).toBeTruthy()
    })

    it("un insert directo con content no-objeto es rechazado", async () => {
      const { error } = await ana.supabase.from("profile_blocks").insert({
        profile_id: ana.profileId,
        block_type: "hero",
        position_index: 0,
        content: [1, 2, 3],
      })
      expect(error).toBeTruthy()
    })

    it("un insert directo con position_index negativo es rechazado", async () => {
      const { error } = await ana.supabase.from("profile_blocks").insert({
        profile_id: ana.profileId,
        block_type: "hero",
        position_index: -5,
        content: {},
      })
      expect(error).toBeTruthy()
    })
  })
})

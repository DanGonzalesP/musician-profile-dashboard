import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

describe("publicación completa y borrador concurrente", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  beforeAll(async () => { ana = await crearUsuario(); beto = await crearUsuario() })
  afterAll(async () => { await limpiarUsuarios(ana, beto) })
  // Igual que EditorPersistence: el borrador declara la versión de catálogo de la
  // que parte (0055). Sin esa procedencia no puede reemplazar el catálogo vivo.
  const draft = (text: string, catalogBaseVersion?: number) => ({ blocks: [{ id: "hero", type: "hero", data: { tagline: text } }],
    products: [], services: [], ...(catalogBaseVersion === undefined ? {} : { catalog_base_version: catalogBaseVersion }) })
  async function state() {
    const { data, error } = await ana.supabase.rpc("read_profile_editor", { p_profile_id: ana.profileId })
    expect(error).toBeNull()
    return data as { content_version: number; draft_revision: number; draft_content: unknown }
  }
  async function save(text: string, expected?: Awaited<ReturnType<typeof state>>) {
    expected ??= await state()
    return ana.supabase.rpc("save_profile_draft", { p_profile_id: ana.profileId, p_draft: draft(text, expected.content_version),
      p_expected_version: expected.content_version, p_expected_revision: expected.draft_revision })
  }
  function product(title: string) {
    return { title, price: 10, images_urls: [], stock_quantity: 1, position_index: 0,
      description: null, category: "otro", product_kind: "fisico", currency: "USD", variants: [],
      purchase_url: null, is_active: true, is_featured: false }
  }
  async function publish(text: string, expected?: Awaited<ReturnType<typeof state>>, products: unknown[] = [product(text)], services: unknown[] = []) {
    expected ??= await state()
    return ana.supabase.rpc("publish_profile_complete", { p_profile_id: ana.profileId,
      p_blocks: [{ block_type: "hero", position_index: 0, content: { tagline: text } }],
      p_products: products, p_services: services, p_expected_version: expected.content_version,
      p_expected_revision: expected.draft_revision })
  }
  async function publicContent() {
    const [blocks, products, services] = await Promise.all([
      clienteAnonimo().from("profile_blocks").select("content").eq("profile_id", ana.profileId!),
      clienteAnonimo().from("products").select("title").eq("seller_id", ana.profileId!),
      clienteAnonimo().from("services").select("title").eq("profile_id", ana.profileId!),
    ])
    for (const result of [blocks, products, services]) expect(result.error).toBeNull()
    return [blocks.data, products.data, services.data]
  }
  it("confirma bloques y catálogo y consume el borrador juntos", async () => {
    expect((await save("borrador")).error).toBeNull()
    expect((await publish("publicado")).error).toBeNull()
    expect(await publicContent()).toEqual([[{ content: { tagline: "publicado" } }], [{ title: "publicado" }], []])
    expect((await state()).draft_content).toBeNull()
  })
  it("un servicio inválido revierte incluso bloques y productos ya insertados", async () => {
    expect((await save("no perder")).error).toBeNull()
    const before = await publicContent()
    const previousState = await state()
    const result = await publish("fallo parcial", previousState, [product("nuevo")], [{ title: "inválido", modality: "desconocida" }])
    expect(result.error).toBeTruthy()
    expect(await publicContent()).toEqual(before)
    expect(await state()).toEqual(previousState)
  })
  it("dos pestañas guardando desde la misma revisión no se pisan", async () => {
    const previous = await state()
    const results = await Promise.all([save("pestaña A", previous), save("pestaña B", previous)])
    expect(results.filter(r => !r.error)).toHaveLength(1)
    expect(results.find(r => r.error)?.error?.code).toBe("PT409")
  })
  it("guardar contra publicar simultáneamente permite sólo un ganador", async () => {
    const previous = await state()
    const results = await Promise.all([save("autoguardado", previous), publish("publicación", previous)])
    expect(results.filter(r => !r.error)).toHaveLength(1)
    expect(results.find(r => r.error)?.error?.code).toBe("PT409")
  })
  it("un autoguardado tardío no resucita el borrador después de publicar", async () => {
    const previous = await state()
    expect((await publish("final", previous)).error).toBeNull()
    expect((await save("tardío", previous)).error?.code).toBe("PT409")
    expect((await state()).draft_content).toBeNull()
  })
  it("reintentar una publicación ya confirmada no incrementa ni reemplaza otra vez", async () => {
    const previous = await state()
    expect((await publish("una vez", previous)).error).toBeNull()
    const confirmed = await state()
    expect((await publish("reintento", previous)).error?.code).toBe("PT409")
    expect(await state()).toEqual(confirmed)
  })
  it("otro usuario y un anónimo no leen el borrador ni publican", async () => {
    const previous = await state()
    for (const client of [beto.supabase, clienteAnonimo()]) {
      const read = await client.rpc("read_profile_editor", { p_profile_id: ana.profileId })
      expect(read.data).toBeNull()
      const result = await client.rpc("publish_profile_complete", { p_profile_id: ana.profileId,
        p_blocks: [], p_products: [], p_services: [], p_expected_version: previous.content_version,
        p_expected_revision: previous.draft_revision })
      expect(result.error).toBeTruthy()
    }
    expect(await state()).toEqual(previous)
  })
  it("un borrador sin procedencia de catálogo no reemplaza el catálogo publicado", async () => {
    const previous = await state()
    const saved = await ana.supabase.rpc("save_profile_draft", { p_profile_id: ana.profileId, p_draft: draft("sin procedencia"),
      p_expected_version: previous.content_version, p_expected_revision: previous.draft_revision })
    expect(saved.error).toBeNull()
    const before = await publicContent()
    const result = await publish("no debe publicarse")
    expect(result.error?.code).toBe("PT409")
    expect(await publicContent()).toEqual(before)
    expect((await save("reconciliado")).error).toBeNull()
    expect((await publish("reconciliado")).error).toBeNull()
  })
  it("ignora identidades de catálogo aportadas por el cliente", async () => {
    expect((await publish("propio", await state(), [{ ...product("propio"), seller_id: beto.profileId }])).error).toBeNull()
    const rows = await beto.supabase.from("products").select("title").eq("seller_id", beto.profileId!)
    expect(rows.data).toEqual([])
  })
})

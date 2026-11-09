import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, prepararMedioHistorico, type UsuarioDePrueba } from "./helpers"

describe("reclamación persistente de medios y referencias concurrentes", () => {
  let owner: UsuarioDePrueba
  let other: UsuarioDePrueba
  beforeAll(async () => { owner = await crearUsuario(); other = await crearUsuario() })
  afterAll(async () => { await limpiarUsuarios(owner, other) })
  async function asset() {
    const key = `images/${owner.id}/${crypto.randomUUID()}.png`
    await prepararMedioHistorico({ key, owner_user_id: owner.id, folder: "images", bytes: 100 })
    return key
  }
  const claim = (key: string, user = owner) => user.supabase.rpc("claim_media_deletion", { p_key: key })
  const url = (key: string) => `https://media.example.invalid/${key}`
  const block = (key: string, user = owner) => user.supabase.from("profile_blocks").insert({
    profile_id: user.profileId, block_type: "hero", position_index: 0, content: { imageUrl: url(key) },
  }).select("id").single()

  it("rechaza visitantes y otros propietarios", async () => {
    const key = await asset()
    expect((await clienteAnonimo().rpc("claim_media_deletion", { p_key: key })).error).toBeTruthy()
    expect((await claim(key, other)).data).toBe(false)
    expect((await claim(key)).data).toBe(true)
  })
  it("protege referencias de otra cuenta sin revelar su contenido", async () => {
    const key = await asset()
    const saved = await block(key, other)
    expect(saved.error).toBeNull()
    expect((await claim(key)).data).toBe(false)
    expect((await owner.supabase.from("media_assets").delete().eq("key", key)).error?.code).toBe("42501")
    expect((await owner.supabase.from("media_assets").select("key").eq("key", key)).data).toEqual([{ key }])
    expect((await other.supabase.from("profile_blocks").delete().eq("id", saved.data!.id)).error).toBeNull()
    expect((await claim(key)).data).toBe(true)
  })
  it("la reclamación persiste, conserva inventario y rechaza nuevas referencias", async () => {
    const key = await asset()
    expect((await claim(key)).data).toBe(true)
    expect((await claim(key)).data).toBe(true)
    expect((await owner.supabase.from("media_assets").delete().eq("key", key)).error?.code).toBe("42501")
    expect((await owner.supabase.from("media_assets").select("key").eq("key", key)).data).toEqual([{ key }])
    expect((await block(key)).error?.code).toBe("PT409")
    // La inserción directa está revocada; el recibo de reserva prueba la
    // protección frente a reutilización dentro de media-reservations.test.ts.
  })
  it("avatares y URLs con escapes/dot segments también bloquean el borrado", async () => {
    const key = await asset()
    const encoded = url(key).replace('/images/', '/unused/../%69mages/./')
    expect((await owner.supabase.from("profiles").update({ avatar_url: encoded }).eq("id", owner.profileId!)).error).toBeNull()
    expect((await claim(key)).data).toBe(false)
    expect((await owner.supabase.from("profiles").update({ avatar_url: null }).eq("id", owner.profileId!)).error).toBeNull()
    expect((await claim(key)).data).toBe(true)
  })
  it("un borrador directo antiguo protege el archivo y su eliminación libera referencia", async () => {
    const key = await asset()
    expect((await owner.supabase.from("profile_private").upsert({ profile_id: owner.profileId,
      draft_content: { blocks: [{ data: { imageUrl: url(key) } }] } })).error).toBeNull()
    expect((await claim(key)).data).toBe(false)
    expect((await owner.supabase.from("profile_private").update({ draft_content: null }).eq("profile_id", owner.profileId!)).error).toBeNull()
    expect((await claim(key)).data).toBe(true)
  })
  it("protege URLs que el navegador normaliza con barras inversas o controles", async () => {
    for (const normalize of [(value: string) => value.replaceAll("/", "\\"),
      (value: string) => value.replace("images", "im\nages")]) {
      const key = await asset()
      const value = normalize(url(key))
      // Acredita que la URL alternativa apunta al mismo recurso para el cliente.
      expect(new URL(value).href).toBe(url(key))
      expect((await owner.supabase.from("profiles").update({ avatar_url: value }).eq("id", owner.profileId!)).error).toBeNull()
      expect((await claim(key)).data).toBe(false)
      expect((await owner.supabase.from("profiles").update({ avatar_url: null }).eq("id", owner.profileId!)).error).toBeNull()
      expect((await claim(key)).data).toBe(true)
    }
  })
  it("referenciar y reclamar a la vez nunca permite ambos resultados", async () => {
    for (let iteration = 0; iteration < 5; iteration++) {
      const key = await asset()
      const [reference, deletion] = await Promise.all([block(key), claim(key)])
      expect(deletion.error).toBeNull()
      expect(Number(!reference.error) + Number(deletion.data === true)).toBe(1)
      if (reference.error) expect(reference.error.code).toBe("PT409")
      else expect((await claim(key)).data).toBe(false)
    }
  })
  it.each(["products", "services", "music_feed"])("protege y libera referencias de %s", async table => {
    const key = await asset()
    const record: Record<string, unknown> = table === "products"
      ? { seller_id: owner.profileId, type: "merch", title: "Medio de prueba", price: 1, images_urls: [url(key)] }
      : table === "services"
        ? { profile_id: owner.profileId, title: "Medio de prueba", image_url: url(key) }
        : { profile_id: owner.profileId, title: "Medio de prueba", audio_url: url(key) }
    const saved = await owner.supabase.from(table).insert(record).select("id").single()
    expect(saved.error).toBeNull()
    expect((await claim(key)).data).toBe(false)
    expect((await owner.supabase.from(table).delete().eq("id", saved.data!.id)).error).toBeNull()
    expect((await claim(key)).data).toBe(true)
  })
  it("cambiar la clave de una fila no deja referencias fantasma", async () => {
    const key = await asset()
    const saved = await block(key)
    expect(saved.error).toBeNull()
    const nextId = -Number(saved.data!.id)
    expect((await owner.supabase.from("profile_blocks").update({ id: nextId }).eq("id", saved.data!.id)).error).toBeNull()
    expect((await owner.supabase.from("profile_blocks").delete().eq("id", nextId)).error).toBeNull()
    expect((await claim(key)).data).toBe(true)
  })
  it("publicación completa y reclamación no confirman simultáneamente el mismo archivo", async () => {
    const key = await asset()
    const editor = await owner.supabase.rpc("read_profile_editor", { p_profile_id: owner.profileId })
    expect(editor.error).toBeNull()
    const [published, deleted] = await Promise.all([
      owner.supabase.rpc("publish_profile_complete", { p_profile_id: owner.profileId,
        p_blocks: [{ block_type: "hero", position_index: 0, content: { imageUrl: url(key) } }],
        p_products: [], p_services: [], p_expected_version: editor.data.content_version,
        p_expected_revision: editor.data.draft_revision }),
      claim(key),
    ])
    expect(deleted.error).toBeNull()
    expect(Number(!published.error) + Number(deleted.data === true)).toBe(1)
    if (published.error) expect(published.error.code).toBe("PT409")
  })
})

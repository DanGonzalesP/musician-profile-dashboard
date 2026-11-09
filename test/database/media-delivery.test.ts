import { afterAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { claveDeMedio, clienteAdministrativo, clienteAnonimo, crearUsuario, limpiarUsuarios, prepararMedioHistorico, type UsuarioDePrueba } from "./helpers"

describe("lectura revocable de medios con JWT real", () => {
  const users: UsuarioDePrueba[] = []
  afterAll(async () => { await limpiarUsuarios(...users) })
  async function fixture() {
    const owner = await crearUsuario(); users.push(owner)
    const key = claveDeMedio(owner)
    await prepararMedioHistorico({ key, owner_user_id: owner.id, folder: "images", bytes: 100, content_type: "image/png" })
    return { owner, key, url: `https://media.example/${key}` }
  }
  const read = (key: string, client = clienteAnonimo()) => client.rpc("resolve_media_read", { p_key: key })
  async function expectRead(key: string, allowed: boolean, client = clienteAnonimo()) {
    const result = await read(key, client)
    expect(result.error).toBeNull()
    expect(result.data).toEqual(allowed ? [{ content_type: "image/png", bytes: 100 }] : [])
  }
  async function suspend(owner: UsuarioDePrueba, value: boolean) {
    expect((await clienteAdministrativo().from("profiles").update({ is_suspended: value }).eq("id", owner.profileId!)).error).toBeNull()
  }
  it("el enlace conocido pierde acceso al suspender y lo recupera al restaurar; el dueño conserva gestión", async () => {
    const { owner, key, url } = await fixture()
    const visitor = await crearUsuario(); users.push(visitor)
    expect((await owner.supabase.from("profiles").update({ avatar_url: url }).eq("id", owner.profileId!)).error).toBeNull()
    for (const suspended of [false, true, false]) {
      await suspend(owner, suspended)
      await expectRead(key, !suspended)
      await expectRead(key, !suspended, visitor.supabase)
      await expectRead(key, true, owner.supabase)
    }
  })
  it("borradores y bloques ocultos no publican; mostrar y ocultar revoca sin cambiar la URL", async () => {
    const { owner, key, url } = await fixture()
    expect((await owner.supabase.from("profile_private").upsert({ profile_id: owner.profileId, draft_content: [{ url }] })).error).toBeNull()
    await expectRead(key, false)
    const block = await owner.supabase.from("profile_blocks").insert({ profile_id: owner.profileId, block_type: "hero", content: { image: url }, is_visible: false }).select("id").single()
    expect(block.error).toBeNull()
    for (const visible of [false, true, false]) {
      expect((await owner.supabase.from("profile_blocks").update({ is_visible: visible }).eq("id", block.data!.id)).error).toBeNull()
      await expectRead(key, visible)
    }
  })
  it("un tercero no publica un archivo privado ajeno ni elude la suspensión copiando su URL", async () => {
    const { owner, key, url } = await fixture()
    const other = await crearUsuario(); users.push(other)
    expect((await other.supabase.from("profiles").update({ avatar_url: url }).eq("id", other.profileId!)).error).toBeNull()
    await expectRead(key, false)
    await expectRead(key, false, other.supabase)
    expect((await owner.supabase.from("profiles").update({ avatar_url: url }).eq("id", owner.profileId!)).error).toBeNull()
    await expectRead(key, true)
    await suspend(owner, true)
    await expectRead(key, false)
    await expectRead(key, false, other.supabase)
  })
  it("desactivar productos y servicios retira la imagen del catálogo", async () => {
    for (const table of ["products", "services"]) {
      const { owner, key, url } = await fixture()
      const values: Record<string, unknown> = table === "products"
        ? { seller_id: owner.profileId, title: "Prueba", price: 1, type: "physical", images_urls: [url] }
        : { profile_id: owner.profileId, title: "Prueba", image_url: url }
      const inserted = await owner.supabase.from(table).insert(values).select("id").single()
      expect(inserted.error).toBeNull()
      await expectRead(key, true)
      expect((await owner.supabase.from(table).update({ is_active: false }).eq("id", inserted.data!.id)).error).toBeNull()
      await expectRead(key, false)
    }
  })
  it("retirar la pista elimina el acceso público al audio", async () => {
    const { owner, key, url } = await fixture()
    const inserted = await owner.supabase.from("music_feed").insert({ profile_id: owner.profileId, title: "Prueba", audio_url: url }).select("id").single()
    expect(inserted.error).toBeNull()
    await expectRead(key, true)
    expect((await owner.supabase.from("music_feed").delete().eq("id", inserted.data!.id)).error).toBeNull()
    await expectRead(key, false)
  })
  it("retirada y cierre de cuenta revocan también el acceso del propietario", async () => {
    const { owner, key } = await fixture()
    await expectRead(key, true, owner.supabase)
    expect((await owner.supabase.rpc("claim_media_deletion", { p_key: key })).data).toBe(true)
    await expectRead(key, false, owner.supabase)
    const second = await fixture()
    // Fixture privado local: las verificaciones posteriores sí llevan JWT real.
    if (process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Sólo Vibe local")
    execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: `insert into private.media_account_state(owner_user_id,state) values('${second.owner.id}','closing') on conflict(owner_user_id) do update set state='closing';`,
      stdio: ["pipe", "pipe", "pipe"], timeout: 15000,
    })
    await expectRead(second.key, false, second.owner.supabase)
  })
  it("una key inexistente no revela metadatos", async () => {
    await expectRead(`images/${crypto.randomUUID()}/${crypto.randomUUID()}.png`, false)
  })
})

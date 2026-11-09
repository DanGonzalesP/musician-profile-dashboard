import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import AxeBuilder from "@axe-core/playwright"
import { prepararMedioHistorico } from "../../test/database/helpers"
import { expect, test, type Page } from "@playwright/test"
import { aislarR2, borrarUsuarioE2E, crearUsuarioE2E, exigirSupabaseLocal, esperarConsolaLimpia,
  iniciarSesion, tokenDeAcceso, vigilarConsola, type UsuarioE2E } from "./fixtures/sesion"

async function actor(usuario: UsuarioE2E) {
  const token = await tokenDeAcceso(usuario)
  const { url, anonKey } = exigirSupabaseLocal()
  return { token, db: createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  }) }
}
async function confirmar(page: Page) {
  const region = page.getByRole("region", { name: "Tus datos" })
  await region.getByRole("button", { name: "Quiero eliminar mi cuenta" }).focus()
  await page.keyboard.press("Enter")
  await region.getByLabel(/Escribe ELIMINAR/).fill("ELIMINAR")
  const { violations } = await new AxeBuilder({ page })
    .include('section[aria-label="Tus datos"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  expect(violations).toEqual([])
  await region.getByRole("button", { name: "Eliminar definitivamente" }).focus()
  const response = page.waitForResponse(r => r.url().endsWith("/api/eliminar-cuenta") && r.request().method() === "POST")
  await page.keyboard.press("Enter")
  return response
}

test.describe("Supresión de cuenta por etapas", () => {
  let usuario: UsuarioE2E
  test.beforeEach(async () => { usuario = await crearUsuarioE2E() })
  test.afterEach(async () => { await borrarUsuarioE2E(usuario) })

  test("retira un archivo, bloquea un PUT tardío y cierra la sesión sólo al terminar", async ({ page, request }, testInfo) => {
    const { token, db } = await actor(usuario)
    const headers = { Authorization: `Bearer ${token}` }
    const reserved = await request.post("/api/upload-url", {
      headers, data: { folder: "images", extension: "png", contentType: "image/png", bytes: 4, profileId: usuario.profileId },
    })
    expect(reserved.status()).toBe(200)
    const upload = await reserved.json()
    expect((await request.put(upload.uploadUrl, { headers: upload.headers, data: Buffer.from([1, 2, 3, 4]) })).status()).toBe(200)
    const finalized = await request.post("/api/finalize-upload", { headers, data: { key: upload.key } })
    expect(finalized.status()).toBe(200)
    const consola = vigilarConsola(page)
    await aislarR2(page)
    await iniciarSesion(page, usuario, "/perfil/config")
    await page.getByRole("region", { name: "Tus datos" }).screenshot({ path: testInfo.outputPath("cierre-antes.png") })
    const closed = await confirmar(page)
    expect(closed.status()).toBe(200)
    expect(await closed.json()).toMatchObject({ eliminada: true, archivosPendientes: 0, archivosRetirados: 1 })
    await expect(page).toHaveURL(/\/$/)
    expect((await db.rpc("media_account_exists")).data).toBe(false)
    const marker = await request.get(new URL(upload.uploadUrl).origin + new URL(upload.uploadUrl).pathname)
    expect(marker.status()).toBe(200)
    expect((await marker.body()).length).toBe(0)
    // La firma aún vigente no puede recrear bytes sobre el marcador.
    expect((await request.put(upload.uploadUrl, { headers: upload.headers, data: Buffer.from([1, 2, 3, 4]) })).status()).toBe(412)
    esperarConsolaLimpia(consola)
  })

  test("un histórico pendiente mantiene la sesión y permite consultar de nuevo", async ({ page }, testInfo) => {
    const { db } = await actor(usuario)
    await prepararMedioHistorico({
      key: `images/${usuario.id}/${randomUUID()}.png`, owner_user_id: usuario.id,
      profile_id: usuario.profileId, folder: "images", bytes: 4, content_type: "image/png",
    })
    const consola = vigilarConsola(page)
    await aislarR2(page)
    await iniciarSesion(page, usuario, "/perfil/config")
    expect((await confirmar(page)).status()).toBe(202)
    const region = page.getByRole("region", { name: "Tus datos" })
    await expect(region.getByRole("status")).toContainText("necesita revisión")
    await expect(page).toHaveURL(/\/perfil\/config$/)
    expect((await db.rpc("media_account_exists")).data).toBe(true)
    const { violations } = await new AxeBuilder({ page })
      .include('section[aria-label="Tus datos"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
    expect(violations).toEqual([])
    await region.screenshot({ path: testInfo.outputPath("cierre-pendiente.png") })
    const retry = page.waitForResponse(r => r.url().endsWith("/api/eliminar-cuenta") && r.request().method() === "POST")
    await region.getByRole("button", { name: "Continuar eliminación" }).focus()
    await page.keyboard.press("Enter")
    expect((await retry).status()).toBe(202)
    await expect(region.getByRole("button", { name: "Continuar eliminación" })).toBeEnabled()
    expect((await db.from("profiles").update({ bio: "No permitido" }).eq("id", usuario.profileId)).error?.code).toBe("PT409")
    esperarConsolaLimpia(consola)
  })
})

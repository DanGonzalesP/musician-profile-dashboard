import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { borrarUsuarioE2E, crearUsuarioE2E, exigirSupabaseLocal, iniciarSesion, tokenDeAcceso, type UsuarioE2E } from "./fixtures/sesion"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
test.describe("entrega privada y revocación de enlaces", () => {
  let owner: UsuarioE2E
  test.beforeAll(async () => { owner = await crearUsuarioE2E() })
  test.afterAll(async () => { await borrarUsuarioE2E(owner) })

  test("sesión real, publicación, rangos, suspensión y restauración sobre la misma URL", async ({ page, playwright, baseURL }) => {
    await iniciarSesion(page, owner)
    const token = await tokenDeAcceso(owner)
    const headers = { Authorization: `Bearer ${token}` }
    const local = exigirSupabaseLocal()
    const authenticated = createClient(local.url, local.anonKey, { global: { headers }, auth: { persistSession: false, autoRefreshToken: false } })
    // Administrador sólo prepara la suspensión; nunca entrega o lee el objeto.
    const admin = createClient(local.url, local.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const visitor = await playwright.request.newContext({ baseURL })
    try {
      const reserve = await page.request.post("/api/upload-url", { headers, data: {
        folder: "images", extension: "png", contentType: "image/png", bytes: PNG.length, profileId: owner.profileId,
      } })
      expect(reserve.status()).toBe(200)
      const intent = await reserve.json()
      const url = `/api/media/${intent.key}`
      expect((await page.request.get(url)).status()).toBe(404)
      expect((await page.request.put(intent.uploadUrl, { data: PNG, headers: intent.headers })).status()).toBe(200)
      const finalized = await page.request.post("/api/finalize-upload", { headers, data: { key: intent.key } })
      expect(finalized.status()).toBe(200)
      expect((await finalized.json()).publicUrl).toBe(url)
      // La cookie SSR permite vista previa privada sin headers Bearer en la imagen.
      expect(await (await page.request.get(url)).body()).toEqual(PNG)
      expect((await visitor.get(url)).status()).toBe(404)
      expect((await authenticated.from("profiles").update({ avatar_url: url }).eq("id", owner.profileId)).error).toBeNull()
      const published = await visitor.get(url)
      expect(published.status()).toBe(200)
      expect(await published.body()).toEqual(PNG)
      expect(published.headers()["cache-control"]).toContain("no-store")
      expect(published.headers()["cloudflare-cdn-cache-control"]).toBe("no-store")
      expect(published.headers()["location"]).toBeUndefined()
      const range = await visitor.get(url, { headers: { Range: "bytes=1-3" } })
      expect(range.status()).toBe(206)
      expect(range.headers()["content-range"]).toBe(`bytes 1-3/${PNG.length}`)
      expect(await range.body()).toEqual(PNG.subarray(1, 4))
      const metadata = await visitor.head(url)
      expect(metadata.status(), "HEAD público debe autorizar el mismo archivo que GET").toBe(200)
      expect(await metadata.body()).toHaveLength(0)
      expect(metadata.headers()["content-type"]).toBe("image/png")
      expect(metadata.headers()["accept-ranges"]).toBe("bytes")
      expect(metadata.headers()["cache-control"]).toContain("no-store")
      // RFC9110 §8.6 permite omitir Content-Length en HEAD. Next send-response
      // filtra esta cabecera por seguridad de framing; el handler sí la calcula
      // y su prueba unitaria exige el valor exacto. Si el runtime la conserva,
      // debe coincidir con el cuerpo ya comprobado por GET y Content-Range.
      const length = metadata.headers()["content-length"]
      if (length !== undefined) expect(length).toBe(String(PNG.length))
      expect((await admin.from("profiles").update({ is_suspended: true }).eq("id", owner.profileId)).error).toBeNull()
      for (const response of [await visitor.get(url), await visitor.head(url), await visitor.get(url, { headers: { Range: "bytes=1-3", "If-None-Match": "previous" } }),
        await visitor.get(`/api/image-proxy?url=${encodeURIComponent(url)}`)]) {
        expect(response.status()).toBe(404)
        expect(await response.body()).toHaveLength(0)
        expect(response.headers()["cache-control"]).toContain("no-store")
      }
      expect((await page.request.get(url)).status()).toBe(200)
      expect((await admin.from("profiles").update({ is_suspended: false }).eq("id", owner.profileId)).error).toBeNull()
      expect((await visitor.get(url)).status()).toBe(200)
    } finally { await visitor.dispose() }
  })
})

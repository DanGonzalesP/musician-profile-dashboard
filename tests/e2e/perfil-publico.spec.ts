import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  aislarRedExterna,
  HERO_FIXTURE,
  PERFIL_FIXTURE,
  PERFIL_SUSPENDIDO,
  PRODUCTO_FIXTURE,
  SERVICIO_FIXTURE,
  SINGLE_FIXTURE,
} from "./fixtures/seed"

// El perfil público, contra fixtures deterministas (ver fixtures/seed.ts).
// Ni un dato real, ni una credencial, ni Docker: `NEXT_PUBLIC_SUPABASE_URL`
// apunta al servidor de fixtures, así que el servidor de Next y el navegador
// ven los mismos datos inventados.
//
// Esta suite es el contrato de no regresión del perfil: si el render cambia lo
// que se ve o deja de venir en el HTML, acá se pone en rojo.

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
})

test("el HTML del servidor trae el contenido del artista, no un esqueleto", async ({ request }) => {
  // Ésta es LA prueba de F10/P-18: se pide el HTML crudo, sin ejecutar nada de
  // JavaScript. Es lo que ve Google y lo que ve el previsualizador de WhatsApp.
  const respuesta = await request.get(`/${PERFIL_FIXTURE.username}`)
  expect(respuesta.status()).toBe(200)

  const html = await respuesta.text()
  expect(html).toContain(PERFIL_FIXTURE.display_name)
  expect(html).toContain(HERO_FIXTURE.content.tagline)
  expect(html).toContain(SINGLE_FIXTURE.content.title)
})

test.describe("sin JavaScript — la prueba dura del render en servidor", () => {
  // Con el navegador sin JS no hay hidratación posible: lo que se ve es
  // exactamente lo que mandó el servidor. Es la diferencia entre "el nombre
  // está en algún lado del HTML" y "el visitante ve el perfil".
  test.use({ javaScriptEnabled: false })

  test("el perfil se ve sin ejecutar una línea de JavaScript", async ({ page }) => {
    await page.goto(`/${PERFIL_FIXTURE.username}`)

    await expect(page.getByText(PERFIL_FIXTURE.display_name).first()).toBeVisible()
    await expect(page.getByText(HERO_FIXTURE.content.tagline).first()).toBeVisible()
    await expect(page.getByText(SINGLE_FIXTURE.content.title).first()).toBeVisible()
  })

  test("la tienda se ve sin ejecutar una línea de JavaScript", async ({ page }) => {
    await page.goto(`/${PERFIL_FIXTURE.username}/tienda`)
    await expect(page.getByText(PRODUCTO_FIXTURE.title).first()).toBeVisible()
  })
})

test("los metadatos sociales se generan con los datos del artista", async ({ request }) => {
  const html = await (await request.get(`/${PERFIL_FIXTURE.username}`)).text()

  expect(html).toMatch(new RegExp(`<title>[^<]*${PERFIL_FIXTURE.display_name}`))
  expect(html).toContain('property="og:title"')
  expect(html).toContain(PERFIL_FIXTURE.bio)
})

test("el perfil renderiza hero, single y el acceso a la tienda", async ({ page }) => {
  await page.goto(`/${PERFIL_FIXTURE.username}`)

  await expect(page.getByText(PERFIL_FIXTURE.display_name).first()).toBeVisible()
  await expect(page.getByText(HERO_FIXTURE.content.tagline).first()).toBeVisible()

  // El single está pintado en el documento. Se comprueba con `toBeAttached` y
  // no con `toBeVisible` a propósito: el bloque de single oculta sus controles
  // hasta que alguien toca el disco (comportamiento actual, deliberado), y
  // esta suite congela la UX que hay, no la que a uno le gustaría.
  await expect(page.getByText(SINGLE_FIXTURE.content.title).first()).toBeAttached()

  // El artista tiene productos y servicios, así que el acceso a su tienda
  // existe. Se localiza por destino y no por texto: la etiqueta es traducible
  // ("Merch y servicios" / "Merch & services") y no debe atarse la prueba a un
  // idioma.
  await expect(page.locator(`a[href="/${PERFIL_FIXTURE.username}/tienda"]`).first()).toBeVisible()
})

test("la tienda del artista muestra su catálogo", async ({ page }) => {
  await page.goto(`/${PERFIL_FIXTURE.username}/tienda`)

  await expect(page.getByText(PRODUCTO_FIXTURE.title).first()).toBeVisible()

  // En escritorio la vitrina y la carta se ven lado a lado; en móvil se
  // alternan con un switch, así que el servicio está en el documento pero
  // oculto hasta cambiar de vista. `toBeAttached` cubre las dos.
  await expect(page.getByText(SERVICIO_FIXTURE.title).first()).toBeAttached()
})

test("un username que no existe devuelve 404 de verdad", async ({ request }) => {
  const respuesta = await request.get("/no_existe_este_artista")
  expect(respuesta.status()).toBe(404)
})

test("un perfil suspendido no se sirve (P-34)", async ({ request }) => {
  // La suspensión tiene que ser efectiva en la superficie pública, no sólo en
  // la base: un perfil suspendido servido desde caché es un takedown que no se
  // ejecutó.
  const respuesta = await request.get(`/${PERFIL_SUSPENDIDO.username}`)
  expect(respuesta.status()).toBe(404)

  const html = await respuesta.text()
  expect(html).not.toContain(PERFIL_SUSPENDIDO.display_name)
})

test("el sitemap no lista perfiles suspendidos (P-34)", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text()

  expect(xml).toContain(`/${PERFIL_FIXTURE.username}`)
  expect(xml).not.toContain(`/${PERFIL_SUSPENDIDO.username}`)
})

test("el perfil público no tiene violaciones graves de accesibilidad", async ({ page }) => {
  await page.goto(`/${PERFIL_FIXTURE.username}`)
  await page.waitForLoadState("networkidle")

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    // Ver docs/accesibilidad.md: contraste de marca y enlaces por color son
    // deuda documentada; no se bloquean para no tocar diseño sin aprobación.
    .disableRules(["color-contrast", "link-in-text-block"])
    .analyze()

  const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  const detalle = graves
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n")

  expect(graves, `Violaciones graves en el perfil público:\n${detalle}`).toEqual([])
})

test("la tienda no tiene violaciones graves de accesibilidad", async ({ page }) => {
  await page.goto(`/${PERFIL_FIXTURE.username}/tienda`)
  await page.waitForLoadState("networkidle")

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast", "link-in-text-block"])
    .analyze()

  const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  const detalle = graves
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n")

  expect(graves, `Violaciones graves en la tienda:\n${detalle}`).toEqual([])
})

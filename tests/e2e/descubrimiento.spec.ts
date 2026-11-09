import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { aislarRedExterna, PERFIL_FIXTURE } from "./fixtures/seed"

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
  await page.goto("/")
  await page.waitForLoadState("networkidle")
})

test("secciones con etiquetas visibles y teclado; vuelve al feed sin perder sus capacidades", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Secciones de Vibe" })
  const services = navigation.getByRole("button", { name: "Servicios", exact: true })
  await expect(services).toHaveText("Servicios")
  await services.focus()
  await page.keyboard.press("Enter")
  await expect(services).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("heading", { name: "Servicios musicales" })).toBeVisible()
  await page.keyboard.press("Tab")
  await expect(navigation.getByRole("button", { name: "Productos" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Productos de artistas" })).toBeVisible()
  await navigation.getByRole("button", { name: "Descubrir" }).click()
  await expect(page.getByRole("button", { name: "Reproducir", exact: true }).first()).toBeVisible()
  for (const button of await navigation.getByRole("button").all()) {
    const box = await button.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  }
})

for (const section of [
  { name: "Servicios", filter: /^Producción musical/, reset: "Ver todos los servicios" },
  { name: "Productos", filter: /^Instrumentos/, reset: "Ver todos los productos" },
]) {
  test(`${section.name}: recupera resultados vacíos y conserva el filtro al cambiar de sección`, async ({ page }) => {
    const navigation = page.getByRole("navigation", { name: "Secciones de Vibe" })
    await navigation.getByRole("button", { name: section.name, exact: true }).click()
    await expect(page.getByRole("status")).toContainText("1 perfil cargado")
    await page.getByRole("button", { name: section.filter }).filter({ visible: true }).click()
    await expect(page.getByRole("status")).toContainText("0 perfiles cargados")
    await expect(page.getByRole("heading", { name: "No hay coincidencias para mostrar" })).toBeVisible()
    await navigation.getByRole("button", { name: "Descubrir" }).click()
    await navigation.getByRole("button", { name: section.name, exact: true }).click()
    await expect(page.getByRole("button", { name: section.filter }).filter({ visible: true })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: section.reset, exact: true }).click()
    await expect(page.getByRole("status")).toContainText("1 perfil cargado")
    const card = page.getByRole("region", { name: /Servicios musicales|Productos de artistas/ }).getByRole("link")
    await expect(card).toHaveAttribute("href", `/${PERFIL_FIXTURE.username}/tienda`)
    await card.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`/${PERFIL_FIXTURE.username}/tienda$`))
  })
}

test("las áreas nuevas de descubrimiento pasan axe con contraste y WCAG 2.2 AA", async ({ page }) => {
  const warnings: string[] = []
  page.on("pageerror", (error) => warnings.push(error.message))
  page.on("console", (message) => { if (["warning", "error"].includes(message.type())) warnings.push(message.text()) })
  for (const name of ["Servicios", "Productos"]) {
    await page.getByRole("navigation", { name: "Secciones de Vibe" }).getByRole("button", { name, exact: true }).click()
    const { violations } = await new AxeBuilder({ page })
      .include('nav[aria-label="Secciones de Vibe"]')
      .include('[aria-label="Filtrar el feed"]')
      .include('[aria-labelledby="discovery-title"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
    expect(violations).toEqual([])
  }
  expect(warnings).toEqual([])
})

test("en un móvil bajo el disco y los controles quedan debajo de los filtros", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await page.getByRole("button", { name: "Solo lo necesario", exact: true }).click()
  const filters = await page.getByRole("group", { name: "Filtrar el feed" }).boundingBox()
  const playButtons = page.getByRole("button", { name: "Reproducir", exact: true })
  const cover = await playButtons.first().boundingBox()
  const controls = await playButtons.nth(1).boundingBox()
  expect(filters).not.toBeNull()
  expect(cover).not.toBeNull()
  expect(controls).not.toBeNull()
  expect(cover!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height)
  // Aunque aparezca un aviso (p. ej. audio no disponible), los controles siguen
  // alcanzables dentro de la pantalla sin quedar encima de los filtros.
  await playButtons.nth(1).scrollIntoViewIfNeeded()
  const reachable = await playButtons.nth(1).boundingBox()
  expect(reachable!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height)
  expect(reachable!.y + reachable!.height).toBeLessThanOrEqual(667)
})

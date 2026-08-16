import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { aislarRedExterna, PERFIL_FIXTURE, PERFIL_SUSPENDIDO, PISTA_FIXTURE, PISTA_SUSPENDIDA, PRODUCTO_SUSPENDIDO } from "./fixtures/seed"

// El feed principal contra fixtures. Lo que se congela acá es doble:
//   • que el contenido público aparece,
//   • y que el contenido de un perfil SUSPENDIDO no aparece por ninguna vía
//     (pista en el feed, producto en descubrimiento, nombre del artista).
//
// La segunda parte es P-34: una suspensión que no se nota en el feed no es una
// suspensión, es una anotación en la base.

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
})

test("el feed sirve la pista pública desde el servidor", async ({ request }) => {
  const html = await (await request.get("/")).text()
  expect(html).toContain(PISTA_FIXTURE.title)
  expect(html).toContain(PERFIL_FIXTURE.display_name)
})

test("el contenido de un perfil suspendido no llega al feed (P-34)", async ({ request }) => {
  const html = await (await request.get("/")).text()

  expect(html).not.toContain(PISTA_SUSPENDIDA.title)
  expect(html).not.toContain(PRODUCTO_SUSPENDIDO.title)
  expect(html).not.toContain(PERFIL_SUSPENDIDO.display_name)
  expect(html).not.toContain(PERFIL_SUSPENDIDO.username)
})

test("el feed carga y es navegable con teclado", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  // Hay al menos un elemento enfocable y el foco entra al documento con Tab.
  await page.keyboard.press("Tab")
  const etiquetaEnfocada = await page.evaluate(() => document.activeElement?.tagName ?? "")
  expect(etiquetaEnfocada).not.toBe("BODY")
})

test("el feed no tiene violaciones graves de accesibilidad", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    // Ver docs/accesibilidad.md.
    .disableRules(["color-contrast", "link-in-text-block"])
    .analyze()

  const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  const detalle = graves
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n")

  expect(graves, `Violaciones graves en el feed:\n${detalle}`).toEqual([])
})

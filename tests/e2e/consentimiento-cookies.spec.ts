import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { aislarRedExterna } from "./fixtures/seed"

// Consentimiento de analítica (P-31 · F14).
//
// Lo que estas pruebas congelan es la promesa que hace `/legal/cookies`: la
// analítica está apagada hasta que el visitante diga que sí, la respuesta se
// recuerda, y el aviso no rompe la accesibilidad ni el uso con teclado.
//
// Por qué no se verifica aquí "la petición a va.vercel-scripts.com no sale":
// en desarrollo y en las pruebas `@vercel/analytics` no se monta NUNCA, ni
// siquiera aceptado (misma condición `NODE_ENV === "production"` que tenía
// app/layout.tsx). Afirmar que la petición no sale probaría el guard de
// NODE_ENV, no el consentimiento. Lo que sí decide el consentimiento —el
// estado guardado y su lectura fail-closed— se prueba en
// lib/consentimiento-cookies.test.ts, y aquí se prueba la interfaz.

const CLAVE = "vibe:consentimiento-analitica"

const aviso = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Consentimiento de analítica" })

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
})

test("el aviso aparece en la primera visita, sin decisión guardada", async ({ page }) => {
  await page.goto("/legal")
  await expect(aviso(page)).toBeVisible()
  await expect(page.getByRole("button", { name: "Aceptar métricas" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Solo lo necesario" })).toBeVisible()
})

test("rechazar guarda la decisión y el aviso no vuelve al recargar", async ({ page }) => {
  await page.goto("/legal")
  await page.getByRole("button", { name: "Solo lo necesario" }).click()
  await expect(aviso(page)).toBeHidden()

  expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE)).toBe("rechazado")

  await page.reload()
  await page.waitForLoadState("networkidle")
  await expect(aviso(page)).toBeHidden()
})

test("aceptar guarda 'aceptado' y tampoco vuelve a preguntar", async ({ page }) => {
  await page.goto("/legal")
  await page.getByRole("button", { name: "Aceptar métricas" }).click()
  await expect(aviso(page)).toBeHidden()

  expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE)).toBe("aceptado")

  await page.reload()
  await page.waitForLoadState("networkidle")
  await expect(aviso(page)).toBeHidden()
})

test("un valor manipulado a mano vuelve a preguntar (fail-closed)", async ({ page }) => {
  await page.goto("/legal")
  await page.evaluate((clave) => localStorage.setItem(clave, "si-claro-que-si"), CLAVE)
  await page.reload()
  await page.waitForLoadState("networkidle")
  await expect(aviso(page)).toBeVisible()
})

test("se puede responder sin mouse: Tab llega a los dos botones", async ({ page }) => {
  await page.goto("/legal")
  await expect(aviso(page)).toBeVisible()

  const rechazar = page.getByRole("button", { name: "Solo lo necesario" })
  await rechazar.focus()
  await expect(rechazar).toBeFocused()

  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Aceptar métricas" })).toBeFocused()

  await page.keyboard.press("Enter")
  await expect(aviso(page)).toBeHidden()
})

test("el aviso no introduce violaciones graves de accesibilidad", async ({ page }) => {
  await page.goto("/legal")
  await expect(aviso(page)).toBeVisible()

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    // Mismas dos exclusiones que legal-a11y.spec.ts, por el mismo motivo
    // (deuda de color documentada en docs/accesibilidad.md).
    .disableRules(["color-contrast", "link-in-text-block"])
    .analyze()

  const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  const detalle = graves
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n")

  expect(graves, `Violaciones graves con el aviso visible:\n${detalle}`).toEqual([])
})

test("sin JavaScript no se pinta el aviso ni se carga analítica", async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false })
  const pagina = await contexto.newPage()
  await aislarRedExterna(pagina)

  const respuesta = await pagina.goto("/legal")
  const html = (await respuesta?.text()) ?? ""

  // El aviso es puramente cliente: el servidor no puede saber qué eligió este
  // visitante, así que no debe adivinarlo en el HTML.
  expect(html).not.toContain("Consentimiento de analítica")
  expect(html).not.toContain("va.vercel-scripts.com")

  await contexto.close()
})

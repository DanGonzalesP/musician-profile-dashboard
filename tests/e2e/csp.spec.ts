import { expect, test } from "@playwright/test"
import { aislarRedExterna } from "./fixtures/seed"

const extraerNonce = (csp: string): string | null =>
  csp.match(/'nonce-([^']+)'/)?.[1] ?? null

test("cada documento recibe una CSP estricta con nonce único", async ({ request }) => {
  const primera = await request.get("/legal")
  const segunda = await request.get("/legal")
  const cspPrimera = primera.headers()["content-security-policy"] ?? ""
  const cspSegunda = segunda.headers()["content-security-policy"] ?? ""
  const scripts = cspPrimera.split("; ").find((parte) => parte.startsWith("script-src")) ?? ""

  expect(extraerNonce(cspPrimera)).toBeTruthy()
  expect(extraerNonce(cspSegunda)).toBeTruthy()
  expect(extraerNonce(cspPrimera)).not.toBe(extraerNonce(cspSegunda))
  expect(scripts).not.toContain("'unsafe-inline'")
  expect(scripts).toContain("'strict-dynamic'")

  expect(primera.headers()["cross-origin-opener-policy"]).toBe("same-origin")
  expect(primera.headers()["cross-origin-resource-policy"]).toBe("same-site")

  const tarjeta = await request.get("/artista_prueba/opengraph-image")
  expect(tarjeta.headers()["cross-origin-resource-policy"]).toBe("cross-origin")
})

test("las superficies públicas no generan violaciones de CSP", async ({ page }) => {
  await aislarRedExterna(page)
  const violaciones: string[] = []

  page.on("console", (mensaje) => {
    const texto = mensaje.text()
    if (/content security policy|violates the following.*directive|refused to/i.test(texto)) {
      violaciones.push(texto)
    }
  })

  for (const ruta of ["/legal", "/feed", "/artista_prueba"]) {
    await page.goto(ruta, { waitUntil: "domcontentloaded" })
  }

  expect(violaciones).toEqual([])
})


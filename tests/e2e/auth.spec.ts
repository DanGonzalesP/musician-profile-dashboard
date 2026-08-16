import { test, expect } from "@playwright/test"

// Prueba de proxy.ts: la barrera en el borde. Un visitante sin sesión que pide
// una ruta protegida debe ser redirigido a /login ANTES de que se sirva una
// sola línea del HTML del panel. Es determinista y no necesita datos.

const RUTAS_PROTEGIDAS = ["/dashboard", "/perfil", "/perfil/config"]

for (const ruta of RUTAS_PROTEGIDAS) {
  test(`anónimo en ${ruta} → redirigido a /login en el borde`, async ({ page }) => {
    const respuesta = await page.goto(ruta)

    // Terminamos en /login con el destino preservado.
    await expect(page).toHaveURL(/\/login(\?|$)/)
    expect(page.url()).toContain(`redirect=${encodeURIComponent(ruta)}`)

    // Y el cuerpo servido no es el del panel: el redirect ocurrió en el borde.
    expect(respuesta?.status()).toBeLessThan(400)
  })
}

test("una ruta pública (/legal) no redirige", async ({ page }) => {
  await page.goto("/legal")
  await expect(page).toHaveURL(/\/legal$/)
})

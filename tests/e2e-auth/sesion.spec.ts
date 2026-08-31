import { expect, test } from "@playwright/test"
import {
  borrarUsuarioE2E,
  crearUsuarioE2E,
  esperarConsolaLimpia,
  iniciarSesion,
  vigilarConsola,
  type UsuarioE2E,
} from "./fixtures/sesion"

// La base del E2E autenticado: que una sesión REAL cruce la barrera del borde.
//
// Todo lo demás de esta carpeta depende de que esto funcione, así que se prueba
// primero y por separado. Si `proxy.ts` dejara de leer la cookie de sesión —el
// bug que ya ocurrió una vez, cuando el cliente guardaba la sesión en
// localStorage y el middleware rebotaba todas las rutas protegidas— es acá
// donde salta.

test.describe("Sesión real contra Supabase local", () => {
  let usuario: UsuarioE2E

  test.beforeAll(async () => {
    usuario = await crearUsuarioE2E()
  })

  test.afterAll(async () => {
    await borrarUsuarioE2E(usuario)
  })

  test("sin sesión, el editor rebota al login en el borde", async ({ page }) => {
    const respuesta = await page.goto("/dashboard")

    // Lo que importa no es sólo el destino: es que el HTML del panel NUNCA
    // llegue al navegador de alguien sin sesión.
    await expect(page).toHaveURL(/\/login/)
    expect(await respuesta?.text()).not.toContain("Publicar")
  })

  test("con sesión real, el editor carga y la consola queda limpia", async ({ page }) => {
    const consola = vigilarConsola(page)

    await iniciarSesion(page, usuario)

    await expect(page).toHaveURL(/\/dashboard/)
    // El editor terminó de cargar cuando aparece el botón de publicar. Se elige
    // ése y no un tile de la biblioteca porque en móvil la biblioteca vive en
    // un cajón cerrado: existe, pero no se ve.
    await expect(page.getByRole("button", { name: /^publicar$/i }).first()).toBeVisible()

    esperarConsolaLimpia(consola)
  })

  test("la sesión sobrevive a una recarga: la cookie es real, no un estado en memoria", async ({ page }) => {
    await iniciarSesion(page, usuario)

    await page.reload()

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole("button", { name: /^publicar$/i }).first()).toBeVisible()
  })
})

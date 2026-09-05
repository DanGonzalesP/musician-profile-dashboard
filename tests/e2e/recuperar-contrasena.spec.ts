import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { aislarRedExterna } from "./fixtures/seed"

// Recuperación de contraseña.
//
// Sin esto, un artista que olvida su contraseña pierde su perfil y no hay
// forma de devolvérselo sin tocar la base a mano: era un bloqueador para abrir
// registros.
//
// Lo que congelan estas pruebas es, sobre todo, **que el formulario no diga
// qué correos tienen cuenta en Vibe**. Un formulario de recuperación que
// responde distinto según exista o no la cuenta es un oráculo público de
// direcciones registradas, y eso vale para phishing dirigido contra artistas.
// La regla es fácil de romper sin querer: basta con que alguien "mejore" el
// mensaje de error en un refactor.
//
// Las reglas puras —longitud mínima, coincidencia, forma de la URL de
// retorno— se prueban sin navegador en `lib/recuperar-contrasena.test.ts`.

const MENSAJE_NEUTRO = /Si ese correo tiene una cuenta en Vibe/

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
})

test("desde el login se llega a recuperar la contraseña", async ({ page }) => {
  await page.goto("/login")

  const enlace = page.getByRole("link", { name: "¿Olvidaste tu contraseña?" })
  await expect(enlace).toBeVisible()

  await enlace.click()
  await expect(page).toHaveURL(/\/recuperar$/)
  await expect(page.getByRole("heading", { name: "Recuperar tu contraseña" })).toBeVisible()
})

// En el formulario de REGISTRO el enlace no debe estar: todavía no hay ninguna
// contraseña que recuperar, y ofrecerlo ahí sólo confunde.
test("el enlace no aparece en el formulario de registro", async ({ page }) => {
  await page.goto("/login?modo=registro")

  await expect(page.getByRole("button", { name: "Registrarse" })).toBeVisible()
  await expect(page.getByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveCount(0)
})

// ─── La propiedad que de verdad importa ───────────────────────────────────
//
// Se prueban los TRES resultados posibles del backend contra la misma
// afirmación. Si algún día alguien añade una rama de error visible, al menos
// uno de estos tres cae.

async function pedirEnlace(page: import("@playwright/test").Page, correo: string) {
  await page.goto("/recuperar")
  await page.getByLabel("Correo Electrónico").fill(correo)
  await page.getByRole("button", { name: "Enviar enlace" }).click()
}

test("una cuenta que existe recibe el mensaje neutro", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (ruta) =>
    ruta.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  )

  await pedirEnlace(page, "artista@ejemplo.com")
  await expect(page.getByRole("status")).toHaveText(MENSAJE_NEUTRO)
})

test("una cuenta que NO existe recibe exactamente el mismo mensaje", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (ruta) =>
    ruta.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "user_not_found", msg: "User not found" }),
    })
  )

  await pedirEnlace(page, "no-existe@ejemplo.com")
  await expect(page.getByRole("status")).toHaveText(MENSAJE_NEUTRO)

  // Y no se filtra por otra vía: nada en la página nombra el fallo.
  await expect(page.locator("body")).not.toContainText("not found")
  await expect(page.locator("body")).not.toContainText("user_not_found")
})

// El caso extremo: el backend entero caído. Aun así el visitante no puede
// distinguirlo de un envío correcto.
test("con el backend caído el mensaje sigue siendo el mismo", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (ruta) => ruta.abort("failed"))

  await pedirEnlace(page, "artista@ejemplo.com")
  await expect(page.getByRole("status")).toHaveText(MENSAJE_NEUTRO)
})

// ─── La página de contraseña nueva ────────────────────────────────────────

test("sin enlace válido no se ofrece el formulario, y hay salida", async ({ page }) => {
  await page.goto("/nueva-contrasena")

  // Se filtra por texto a propósito: Next mantiene su propio
  // `<div role="alert" id="__next-route-announcer__">` en todas las páginas,
  // así que `getByRole("alert")` a secas casa con dos elementos y falla por
  // modo estricto. Se conserva el rol en la aserción —importa para lectores
  // de pantalla— y se acota por contenido.
  const aviso = page.getByRole("alert").filter({ hasText: "Este enlace ya no sirve" })
  await expect(aviso).toBeVisible()

  // Lo importante: NO se pinta un formulario que no puede funcionar.
  await expect(page.getByRole("button", { name: "Guardar contraseña" })).toHaveCount(0)

  // Y el usuario no queda en un callejón sin salida.
  await expect(page.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute(
    "href",
    "/recuperar"
  )
})

// `/nueva-contrasena` NO puede estar protegida por el middleware: Supabase
// manda el token en el FRAGMENTO de la URL, que nunca llega al servidor. Si
// alguien la añadiera a RUTAS_PROTEGIDAS, el enlace del correo dejaría de
// funcionar para todo el mundo y nada más lo detectaría.
test("las dos rutas son públicas: el middleware no las rebota a /login", async ({ page }) => {
  for (const ruta of ["/recuperar", "/nueva-contrasena"]) {
    await page.goto(ruta)
    await expect(page).toHaveURL(new RegExp(`${ruta}$`))
  }
})

// ─── Accesibilidad ────────────────────────────────────────────────────────

for (const ruta of ["/recuperar", "/nueva-contrasena"]) {
  test(`${ruta} no tiene violaciones graves de accesibilidad`, async ({ page }) => {
    await page.goto(ruta)

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // Las MISMAS dos exclusiones que legal-a11y.spec.ts y
      // consentimiento-cookies.spec.ts, por el mismo motivo: son deuda de
      // color ya documentada en docs/accesibilidad.md, no algo que estas
      // páginas introduzcan.
      //
      // Concretamente, aquí `color-contrast` salta por el botón primario
      // (`.bg-primary`, el rojo de marca a 3.89:1) y por el botón "Aceptar
      // métricas" del aviso de cookies, que sale en todas las páginas. Subir
      // ese contraste es cambiar el color de la MARCA, y el plan prohíbe
      // cambios visuales sin aprobación explícita. Arreglarlo por la puerta de
      // atrás en una pantalla de contraseñas seria justo lo contrario.
      .disableRules(["color-contrast", "link-in-text-block"])
      .analyze()

    const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")

    // Se incluye el selector del nodo, no sólo la regla: un "color-contrast"
    // a secas obliga a reproducir la corrida entera para saber qué elemento
    // falló.
    const detalle = graves.flatMap((v) =>
      v.nodes.map((n) => `${v.id} @ ${n.target.join(" ")} — ${n.failureSummary ?? v.help}`)
    )
    expect(detalle).toEqual([])
  })
}

test("se puede recorrer y enviar el formulario sólo con teclado", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (ruta) =>
    ruta.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  )

  await page.goto("/recuperar")

  const campo = page.getByLabel("Correo Electrónico")
  await campo.focus()
  await campo.type("artista@ejemplo.com")
  await page.keyboard.press("Tab")

  await expect(page.getByRole("button", { name: "Enviar enlace" })).toBeFocused()
  await page.keyboard.press("Enter")

  await expect(page.getByRole("status")).toHaveText(MENSAJE_NEUTRO)
})

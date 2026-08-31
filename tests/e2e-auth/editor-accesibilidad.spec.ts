import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  abrirBibliotecaDeBloques,
  aislarR2,
  borrarUsuarioE2E,
  crearUsuarioE2E,
  iniciarSesion,
  type UsuarioE2E,
} from "./fixtures/sesion"

// Accesibilidad del EDITOR autenticado — el bloqueo humano "G" del registro de
// implementación, que decía: «Exige una sesión autenticada real; el servidor de
// fixtures es de sólo lectura y sin auth a propósito».
//
// Ya no lo es. Con Supabase local hay sesión real, así que el editor —la
// superficie más interactiva de Vibe, y la única que quedaba sin auditar (P-33)—
// entra al mismo gate que las páginas legales y el perfil público.
//
// Criterio, idéntico al del resto de la suite: cero violaciones críticas ni
// serias. Las dos reglas de dependencia del color se excluyen con la misma
// justificación documentada en docs/accesibilidad.md — arreglarlas cambia
// píxeles, y eso necesita aprobación humana.

test.describe("Editor · accesibilidad", () => {
  let usuario: UsuarioE2E

  test.beforeAll(async () => {
    usuario = await crearUsuarioE2E()
  })

  test.afterAll(async () => {
    await borrarUsuarioE2E(usuario)
  })

  test("el editor recién cargado no tiene violaciones críticas ni serias", async ({ page }) => {
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await expect(page.getByRole("button", { name: /^publicar$/i }).first()).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast", "link-in-text-block"])
      .analyze()

    const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    const detalle = graves
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      .join("\n")

    expect(graves, `Violaciones graves en el editor:\n${detalle}`).toEqual([])
  })

  test("el inspector abierto tampoco introduce violaciones", async ({ page }) => {
    // El inspector es un panel enorme de formularios: es donde más fácil se
    // cuela un control sin nombre accesible.
    await aislarR2(page)
    await iniciarSesion(page, usuario)

    await abrirBibliotecaDeBloques(page)
    await page.getByRole("button", { name: /agregar bloque meta de producción/i }).click()
    await expect(page.getByRole("textbox", { name: /título de la campaña/i })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast", "link-in-text-block"])
      .analyze()

    const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    const detalle = graves
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      .join("\n")

    expect(graves, `Violaciones graves con el inspector abierto:\n${detalle}`).toEqual([])
  })
})

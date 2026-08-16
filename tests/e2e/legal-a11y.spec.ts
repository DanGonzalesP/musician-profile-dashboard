import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// Accesibilidad (P-33) sobre las páginas que NO dependen de datos: las legales
// y el login. Son estáticas, así que su a11y se puede exigir en CI sin sembrar
// nada. El editor y el perfil (interactivos, con datos) se cubren en sus
// propias specs con interyección de red.
//
// Criterio: cero violaciones críticas ni serias. Las moderadas/leves se
// registran pero no bloquean todavía (mismo trinquete que el lint).

const PAGINAS = [
  "/legal",
  "/legal/terminos",
  "/legal/privacidad",
  "/legal/copyright",
  "/legal/comunidad",
  "/legal/cookies",
  "/login",
]

for (const ruta of PAGINAS) {
  test(`${ruta} sin violaciones críticas ni serias de axe`, async ({ page }) => {
    await page.goto(ruta)
    await page.waitForLoadState("networkidle")

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      // Dos reglas de "dependencia del color" se excluyen del gate a propósito
      // (deuda documentada en docs/accesibilidad.md): el contraste del color de
      // marca (.bg-primary, WCAG 1.4.3) y los enlaces distinguibles sólo por
      // color en el cuerpo legal (link-in-text-block). Arreglar cualquiera de
      // las dos cambia píxeles, y el principio innegociable del plan es "cero
      // cambios visuales sin aprobación". Todo lo demás (roles, nombres
      // accesibles, foco, landmarks, formularios) SÍ bloquea.
      .disableRules(["color-contrast", "link-in-text-block"])
      .analyze()

    const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious")

    // Mensaje útil si falla: qué regla y en qué nodo.
    const detalle = graves
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      .join("\n")

    expect(graves, `Violaciones graves en ${ruta}:\n${detalle}`).toEqual([])
  })
}

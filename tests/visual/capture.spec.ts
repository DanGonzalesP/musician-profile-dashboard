import { existsSync } from "node:fs"
import { join } from "node:path"
import { test, expect } from "@playwright/test"
import { aislarRedExterna, PERFIL_FIXTURE } from "../e2e/fixtures/seed"

// Regresión visual en dos capas. Resuelve el problema Windows/Linux que
// Canodent ya había resuelto: las métricas de fuente difieren entre sistemas,
// así que una referencia de píxeles de Windows no se puede comparar contra una
// corrida en Linux (CI).
//
//   1. Instantánea ARIA (`toMatchAriaSnapshot`): DETERMINISTA e independiente
//      de la plataforma. Es la estructura semántica —roles, nombres,
//      jerarquía—. Si el render cambia la estructura, esto lo detecta en CI, en
//      cualquier SO. Se versiona como texto, así que un cambio se revisa
//      leyendo el diff.
//
//   2. Captura de píxeles (`toHaveScreenshot`): por plataforma. Detecta el
//      cambio visual fino. Sus referencias las APRUEBA una persona (acción
//      humana #9 del plan: definen oficialmente "así se ve Vibe"), y se generan
//      con `pnpm test:visual:update`. Si todavía no existe la referencia de la
//      plataforma actual, esta capa se OMITE en vez de fallar — una prueba en
//      rojo que nadie puede arreglar se aprende a ignorar.
//
// Las páginas capturadas incluyen el perfil público porque ahora es
// determinista: sus datos salen del servidor de fixtures, no de una base real.

const PAGINAS: { ruta: string; nombre: string }[] = [
  { ruta: "/legal", nombre: "legal-index" },
  { ruta: "/legal/terminos", nombre: "legal-terminos" },
  { ruta: "/login", nombre: "login" },
  // La portada ES el feed: el carril de categorías, las pistas y el
  // descubrimiento. Es la primera pantalla que ve cualquier visitante y la que
  // más ha cambiado de forma (riel vertical, pestañas, comentarios), así que
  // congelar su estructura vale al menos tanto como la del perfil.
  { ruta: "/", nombre: "feed" },
  { ruta: `/${PERFIL_FIXTURE.username}`, nombre: "perfil-publico" },
  { ruta: `/${PERFIL_FIXTURE.username}/tienda`, nombre: "tienda" },
]

/**
 * Nombre de la captura de píxeles. Lleva la plataforma DENTRO del nombre —y no
 * en la plantilla de rutas— para que sólo los PNG queden separados por sistema
 * operativo y la instantánea ARIA siga siendo una sola, comparable en todos.
 */
function nombreDeCaptura(base: string): string {
  return `${base}-${process.platform}.png`
}

/** Misma ruta que `snapshotPathTemplate` de playwright.visual.config.ts. */
function rutaDeReferencia(nombreProyecto: string, archivo: string): string {
  return join(process.cwd(), "tests", "visual", "referencias", nombreProyecto, nombreDeCaptura(archivo))
}

test.beforeEach(async ({ page }) => {
  await aislarRedExterna(page)
})

for (const { ruta, nombre } of PAGINAS) {
  test(`${nombre} — estructura ARIA estable`, async ({ page }) => {
    await page.goto(ruta)
    await page.waitForLoadState("networkidle")
    // La capa determinista: se compara siempre, en todo sistema operativo.
    await expect(page.locator("body")).toMatchAriaSnapshot({ name: `${nombre}.aria.yml` })
  })

  test(`${nombre} — captura de píxeles (referencia por plataforma)`, async ({ page }, testInfo) => {
    const referencia = rutaDeReferencia(testInfo.project.name, nombre)
    test.skip(
      !existsSync(referencia),
      `Sin referencia aprobada para ${process.platform}. Generala con: pnpm test:visual:update`
    )

    await page.goto(ruta)
    await page.waitForLoadState("networkidle")

    // Sin animaciones ni transiciones, y con las imágenes ya resueltas: son
    // las dos fuentes de falsos positivos en una captura.
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
    })
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((res) => { img.onload = img.onerror = res }))
      )
    })

    await expect(page).toHaveScreenshot(nombreDeCaptura(nombre), { fullPage: true })
  })
}

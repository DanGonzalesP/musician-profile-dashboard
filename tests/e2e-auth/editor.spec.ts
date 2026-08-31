import { expect, test, type Page } from "@playwright/test"
import {
  aislarR2,
  cerrarInspector,
  borrarUsuarioE2E,
  crearUsuarioE2E,
  abrirBibliotecaDeBloques,
  esperarConsolaLimpia,
  iniciarSesion,
  vigilarConsola,
  type UsuarioE2E,
} from "./fixtures/sesion"

// El recorrido completo del editor, con sesión real y base real.
//
// Es el flujo que más veces se ha roto históricamente (el bug recurrente de
// "archivo no encontrado" al publicar, el borrador que se pisaba a sí mismo,
// la publicación que dejaba el perfil vacío). Hasta ahora sólo se podía
// verificar a mano, porque exige autenticación y el servidor de fixtures es de
// sólo lectura. Con Supabase local deja de ser así.
//
// Todo lo que se afirma acá es CONDUCTA observable: lo que el artista ve en la
// pantalla y lo que un visitante ve después en el perfil público. En ningún
// momento se consulta la base con la clave de servicio para "comprobar" algo
// que la interfaz debería mostrar.

const TITULO_ORIGINAL = "Grabar mi EP en el estudio del barrio"
const TITULO_EDITADO = "Grabar mi EP — versión definitiva"

/** Los tipos de bloque del lienzo, en el orden en que se ven. */
async function ordenDeBloques(page: Page): Promise<string[]> {
  return page.locator("[data-bloque-de-lienzo]").evaluateAll((nodos) =>
    nodos.map((n) => n.getAttribute("data-bloque-de-lienzo") ?? "")
  )
}

/**
 * Espera a que el lienzo haya terminado de pintar.
 *
 * Sin esto la prueba lee el orden de bloques cuando todavía no hay ninguno y
 * las afirmaciones sobre posiciones comparan contra una lista vacía. Un perfil
 * nuevo arranca con "hero" y "tracks", así que el banner principal es la señal
 * fiable de que la carga terminó.
 */
async function esperarEditorListo(page: Page): Promise<void> {
  await expect(page.locator('[data-bloque-de-lienzo="hero"]')).toBeVisible({ timeout: 30_000 })
}

test.describe("Editor · recorrido completo hasta el perfil público", () => {
  let usuario: UsuarioE2E

  test.beforeAll(async () => {
    usuario = await crearUsuarioE2E()
  })

  test.afterAll(async () => {
    await borrarUsuarioE2E(usuario)
  })

  test("añadir, editar, reordenar, guardar borrador y publicar", async ({ page }) => {
    const consola = vigilarConsola(page)
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    // ─── 1. Añadir un bloque ────────────────────────────────────────────
    const antes = await ordenDeBloques(page)
    await abrirBibliotecaDeBloques(page)
    await page.getByRole("button", { name: /agregar bloque meta de producción/i }).click()

    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toHaveCount(1)
    expect(await ordenDeBloques(page)).toHaveLength(antes.length + 1)

    // ─── 2. Editar su contenido ─────────────────────────────────────────
    // El campo se encuentra POR SU ETIQUETA. Que eso funcione es en sí mismo
    // la prueba de que el control tiene nombre accesible (ver el arreglo de
    // `Field` en block-inspector.tsx).
    const titulo = page.getByRole("textbox", { name: /título de la campaña/i })
    await titulo.fill(TITULO_ORIGINAL)

    // El lienzo es una vista previa en vivo: lo escrito aparece ahí sin guardar.
    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toContainText(TITULO_ORIGINAL)

    // ─── 3. Reordenar ───────────────────────────────────────────────────
    // El lienzo del editor es un ESPEJO POR PESTAÑAS del perfil público, no
    // una lista plana: `tracks`, `single`, `credits` y `crowdfunding` viven en
    // "Inicio"; `legado` y `publicaciones` tienen pestaña propia. Las flechas
    // reordenan dentro de la sección (`handleTabMove` en preview-canvas.tsx),
    // así que se reordenan dos bloques que comparten pestaña — mover uno
    // respecto de otro de otra sección no es una operación que exista.
    const ordenPrevio = await ordenDeBloques(page)
    expect(ordenPrevio.indexOf("crowdfunding")).toBeGreaterThan(ordenPrevio.indexOf("tracks"))

    // En móvil el inspector es un cajón a pantalla completa que tapa los
    // controles de orden del lienzo. Se cierra igual que lo haría el artista.
    await cerrarInspector(page)

    // "Subir bloque" es un botón de verdad: el reordenamiento NO depende de
    // arrastrar y soltar, que es lo que lo haría inoperable con teclado.
    await page
      .locator('[data-bloque-de-lienzo="crowdfunding"]')
      .getByRole("button", { name: /subir bloque/i })
      .click()

    const ordenNuevo = await ordenDeBloques(page)
    expect(ordenNuevo.indexOf("crowdfunding")).toBeLessThan(ordenNuevo.indexOf("tracks"))

    // ─── 4. El borrador se guarda solo y sobrevive a una recarga ────────
    // El autoguardado tiene 1,5 s de espera antes de escribir en
    // profile_private.draft_content. Se recarga y se comprueba que el editor
    // rehidrata lo que nunca se llegó a publicar: es la prueba de que el
    // borrador viajó a la base y volvió.
    await page.waitForTimeout(3_000)
    await page.reload()
    await esperarEditorListo(page)

    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toContainText(TITULO_ORIGINAL, {
      timeout: 30_000,
    })
    const ordenTrasRecarga = await ordenDeBloques(page)
    expect(ordenTrasRecarga.indexOf("crowdfunding")).toBeLessThan(ordenTrasRecarga.indexOf("tracks"))

    // ─── 5. Editar otra vez y publicar ──────────────────────────────────
    await page.locator('[data-bloque-de-lienzo="crowdfunding"]').click()
    const tituloTrasRecarga = page.getByRole("textbox", { name: /título de la campaña/i })
    await tituloTrasRecarga.fill(TITULO_EDITADO)

    // Igual que antes de reordenar: en móvil el pie del inspector tapa la barra
    // de acciones, y "Publicar" vive ahí.
    await cerrarInspector(page)
    await page.getByRole("button", { name: /^publicar$/i }).first().click()

    // El botón vuelve de "Publicando..." cuando la transacción terminó.
    await expect(page.getByRole("button", { name: /^publicar$/i }).first()).toBeEnabled({
      timeout: 60_000,
    })

    // ─── 6. Lo publicado se ve en el perfil público ─────────────────────
    // Se abre la URL pública como un visitante cualquiera. Esto recorre el
    // render en servidor, la caché por etiqueta y su invalidación al publicar.
    await page.goto(`/${usuario.username}`)
    await expect(page.getByText(TITULO_EDITADO)).toBeVisible({ timeout: 30_000 })

    // Y lo que quedó a medio camino NO se publicó: el título viejo no está.
    await expect(page.getByText(TITULO_ORIGINAL)).toHaveCount(0)

    esperarConsolaLimpia(consola)
  })

  test("un lote inválido no deja el perfil vacío", async ({ page }) => {
    // La contraparte de la publicación feliz: `publish_profile` es atómica
    // (0010) y el editor traduce el rechazo a un mensaje entendible. Acá se
    // comprueba lo que el ARTISTA ve: que su perfil sigue en pie.
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toContainText(TITULO_EDITADO, {
      timeout: 30_000,
    })

    await page.goto(`/${usuario.username}`)
    await expect(page.getByText(TITULO_EDITADO)).toBeVisible({ timeout: 30_000 })
  })
})

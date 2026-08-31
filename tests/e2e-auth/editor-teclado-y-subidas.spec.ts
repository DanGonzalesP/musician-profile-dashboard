import { expect, test, type Page } from "@playwright/test"
import {
  abrirBibliotecaDeBloques,
  aislarR2,
  cerrarInspector,
  borrarUsuarioE2E,
  crearUsuarioE2E,
  esperarConsolaLimpia,
  iniciarSesion,
  tokenDeAcceso,
  vigilarConsola,
  type UsuarioE2E,
} from "./fixtures/sesion"

// Dos criterios de aceptación de F8 que sólo se pueden comprobar con sesión:
// que el editor se maneje SÓLO con teclado (P-33), y que subir una imagen y un
// audio funcione sin escribir un objeto real en R2.

/** PNG de 1x1 válido: pesa 70 bytes y el navegador lo decodifica de verdad. */
const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

/**
 * Un mp3 mínimo: una sola trama MPEG-1 Layer III en silencio.
 *
 * No se usa un archivo real del repositorio a propósito — versionar audio con
 * derechos para una prueba es exactamente lo que `AGENTS.md` prohíbe. Estos
 * bytes no son música de nadie, y al editor le alcanzan: valida por extensión y
 * MIME, y calcula el SHA-256 del contenido. No decodifica.
 */
const MP3_MINIMO = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x64]),
  Buffer.alloc(413, 0),
])

async function esperarEditorListo(page: Page): Promise<void> {
  await expect(page.locator('[data-bloque-de-lienzo="hero"]')).toBeVisible({ timeout: 30_000 })
}

/** Publica y espera a que la transacción termine (el botón se rehabilita). */
async function publicarYEsperar(page: Page): Promise<void> {
  // En móvil el pie del inspector trae "Guardar cambios" justo encima de la
  // barra de acciones, así que tapa "Publicar" mientras el cajón está abierto.
  await cerrarInspector(page)
  const publicar = page.getByRole("button", { name: /^publicar$/i }).first()
  await publicar.click()
  await expect(publicar).toBeEnabled({ timeout: 60_000 })
}

/**
 * El PUT va al host virtual-hosted (bucket como subdominio del endpoint) y
 * lleva la firma del SDK. Si `/api/upload-url` no hubiera firmado de verdad,
 * no habría credencial en la query; si la CSP no permitiera ESE host exacto,
 * el navegador no habría dejado salir la petición.
 */
function esperarPutFirmado(url: string): void {
  expect(url).toMatch(/^https:\/\/vibe-e2e\.r2-de-prueba\.localhost\//)
  expect(url).toContain("X-Amz-Signature")
}

test.describe("Editor · teclado", () => {
  let usuario: UsuarioE2E

  test.beforeAll(async () => {
    usuario = await crearUsuarioE2E()
  })

  test.afterAll(async () => {
    await borrarUsuarioE2E(usuario)
  })

  test("se añade un bloque sin tocar el ratón", async ({ page }) => {
    // La biblioteca de bloques está hecha de <div role="button">. Que respondan
    // a Enter no es un detalle: es la diferencia entre que un artista que no
    // usa ratón pueda armar su perfil o no pueda.
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    await abrirBibliotecaDeBloques(page)
    const tile = page.getByRole("button", { name: /agregar bloque meta de producción/i })
    await tile.focus()
    await expect(tile).toBeFocused()

    await page.keyboard.press("Enter")
    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toHaveCount(1)
  })

  test("se escribe en el inspector y se reordena sin tocar el ratón", async ({ page }) => {
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    // Se agrega acá mismo y no se depende de la prueba anterior: el borrador
    // se autoguarda por usuario, así que dar por hecho el estado que dejó otra
    // prueba las volvería dependientes del orden.
    await abrirBibliotecaDeBloques(page)
    const tile = page.getByRole("button", { name: /agregar bloque meta de producción/i })
    await tile.focus()
    await page.keyboard.press("Enter")
    await expect(page.locator('[data-bloque-de-lienzo="crowdfunding"]')).toHaveCount(1)

    // Escribir en el campo del inspector, sólo con teclado.
    const titulo = page.getByRole("textbox", { name: /título de la campaña/i })
    await titulo.focus()
    await page.keyboard.type("Escrito sólo con teclado")
    await expect(titulo).toHaveValue("Escrito sólo con teclado")

    // En móvil el inspector tapa el lienzo mientras está abierto.
    await cerrarInspector(page)

    // Y reordenar: las flechas de orden son <button>, así que reciben foco y
    // responden a Enter. Si el reordenamiento dependiera únicamente de
    // arrastrar y soltar, esto sería imposible.
    const subir = page
      .locator('[data-bloque-de-lienzo="crowdfunding"]')
      .getByRole("button", { name: /subir bloque/i })
    await subir.focus()
    await expect(subir).toBeFocused()
    await page.keyboard.press("Enter")

    const orden = await page
      .locator("[data-bloque-de-lienzo]")
      .evaluateAll((n) => n.map((x) => x.getAttribute("data-bloque-de-lienzo") ?? ""))
    expect(orden.indexOf("crowdfunding")).toBeLessThan(orden.indexOf("tracks"))
  })

  test("el botón de publicar es alcanzable con teclado", async ({ page }) => {
    await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    const publicar = page.getByRole("button", { name: /^publicar$/i }).first()
    await publicar.focus()
    await expect(publicar).toBeFocused()
    await expect(publicar).toBeEnabled()
  })
})

test.describe("Editor · subidas a R2", () => {
  let usuario: UsuarioE2E

  test.beforeAll(async () => {
    usuario = await crearUsuarioE2E()
  })

  test.afterAll(async () => {
    await borrarUsuarioE2E(usuario)
  })

  // Se prueban por separado, una subida por prueba. Coordinar dos cargas
  // asíncronas (la compresión de la imagen y el SHA-256 del audio) dentro de
  // una sola prueba la volvía frágil sin cubrir nada más: lo que hay que
  // demostrar es que CADA tipo de archivo llega firmado a R2 y que ninguna
  // blob URL sobrevive a la publicación.

  test("una imagen sube a R2 y no deja blob URLs en lo publicado", async ({ page }) => {
    const consola = vigilarConsola(page)
    const r2 = await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    // En escritorio el inspector ya muestra el banner principal al entrar; en
    // móvil hay que seleccionarlo para que su cajón se abra. Seleccionarlo
    // siempre deja las dos plataformas en el mismo punto de partida.
    await page.locator('[data-bloque-de-lienzo="hero"]').click()
    await page
      .locator('input[type="file"][aria-label="Subir foto"]')
      .setInputFiles({ name: "portada.png", mimeType: "image/png", buffer: PNG_MINIMO })

    // Se espera a que el editor CONFIRME la imagen (el botón pasa de "Subir" a
    // "Cambiar"). No es cosmético: la compresión en el navegador es asíncrona,
    // y publicar antes de que termine deja el archivo fuera del registro de
    // blobs — la foto se perdería en silencio.
    await expect(page.getByRole("button", { name: /cambiar imagen/i }).first()).toBeVisible()

    // Hasta acá R2 no se tocó: el archivo vive como blob URL en el navegador.
    // El PUT firmado ocurre recién al publicar (`resolveEntityBlobs`).
    expect(r2.puts).toEqual([])

    await publicarYEsperar(page)

    const rutas = r2.puts.map((u) => new URL(u).pathname)
    expect(rutas.some((p) => p.startsWith("/images/")), `PUT observados: ${rutas.join(", ") || "(ninguno)"}`).toBe(true)
    for (const url of r2.puts) esperarPutFirmado(url)

    // Ninguna blob URL sobrevivió: son referencias que mueren al cerrar la
    // pestaña, y guardarlas es el bug histórico de "archivo no encontrado".
    await page.goto(`/${usuario.username}`)
    expect(await page.content()).not.toContain("blob:")

    esperarConsolaLimpia(consola)
  })

  test("un audio sube a R2 con su URL firmada", async ({ page }) => {
    const consola = vigilarConsola(page)
    const r2 = await aislarR2(page)
    await iniciarSesion(page, usuario)
    await esperarEditorListo(page)

    await abrirBibliotecaDeBloques(page)
    await page.getByRole("button", { name: /agregar bloque lanzamiento actual/i }).click()
    await page
      .locator('input[type="file"][aria-label="Subir audio"]')
      .setInputFiles({ name: "demo.mp3", mimeType: "audio/mpeg", buffer: MP3_MINIMO })

    // La señal de que el audio YA está en los datos del bloque es que el botón
    // de preescucha se habilita: su `disabled` cuelga de `data.audioUrl`.
    // "Cambiar audio" no sirve como señal — aparece apenas se elige el
    // archivo, mientras el SHA-256 todavía se está calculando, y publicar en
    // ese instante sube cero archivos y guarda el bloque sin audio.
    await expect(page.getByRole("button", { name: /escuchar antes de publicar/i })).toBeEnabled({
      timeout: 30_000,
    })

    await publicarYEsperar(page)

    const rutas = r2.puts.map((u) => new URL(u).pathname)
    expect(rutas.some((p) => p.startsWith("/audio/")), `PUT observados: ${rutas.join(", ") || "(ninguno)"}`).toBe(true)
    for (const url of r2.puts) esperarPutFirmado(url)

    esperarConsolaLimpia(consola)
  })

  test("la ruta de subida nunca filtra detalles internos", async ({ page }) => {
    // El fail-closed sin configuración (503) lo fijan las pruebas unitarias de
    // `lib/r2-config.ts`: acá R2 SÍ está configurado, así que no se puede
    // provocar esa rama sin levantar un segundo servidor. Lo que sí se exige
    // acá, con una sesión real, es la otra mitad del contrato: pase lo que
    // pase, la respuesta no nombra una variable de entorno, un bucket ni un
    // endpoint.
    // `page.request` resuelve las rutas relativas contra la página actual, así
    // que primero hay que estar en alguna.
    await page.goto("/legal")
    const token = await tokenDeAcceso(usuario)

    const respuesta = await page.request.post("/api/upload-url", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { folder: "images", extension: "png", contentType: "image/png", bytes: 10 },
    })

    expect(respuesta.status()).toBe(200)
    const texto = JSON.stringify(await respuesta.json())
    expect(texto).not.toContain("R2_")
    expect(texto).not.toMatch(/secret|access.?key/i)

    // Y una petición inválida tampoco se va de lengua.
    const invalida = await page.request.post("/api/upload-url", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { folder: "../../etc", extension: "sh", contentType: "text/x-sh", bytes: 10 },
    })
    expect(invalida.status()).toBe(400)
    const textoInvalido = JSON.stringify(await invalida.json())
    expect(textoInvalido).not.toContain("R2_")
    expect(textoInvalido).not.toMatch(/secret|access.?key|cloudflarestorage/i)
  })
})

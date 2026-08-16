import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  aislarRedExterna,
  CREDITOS_TIKTOK,
  EMBED_TIKTOK_PUBLICACION,
  PERFIL_EMBEDS,
} from "./fixtures/seed"

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

const escucharViolaciones = (page: Page, destino: string[]) => {
  page.on("console", (mensaje) => {
    const texto = mensaje.text()
    if (/content security policy|violates the following.*directive|refused to/i.test(texto)) {
      destino.push(texto)
    }
  })
}

test("las superficies públicas no generan violaciones de CSP", async ({ page }) => {
  await aislarRedExterna(page)
  const violaciones: string[] = []
  escucharViolaciones(page, violaciones)

  for (const ruta of ["/legal", "/feed", "/artista_prueba", `/${PERFIL_EMBEDS.username}`]) {
    await page.goto(ruta, { waitUntil: "domcontentloaded" })
  }

  expect(violaciones).toEqual([])
})

/**
 * `aislarRedExterna` responde cualquier imagen externa con un PNG de 1×1, así
 * que una miniatura que la CSP deja pasar termina con naturalWidth > 0. Si la
 * política bloquea el host, la petición ni siquiera sale del navegador y se
 * queda en 0: es la diferencia entre comprobar que la política DEJA VER la
 * miniatura y comprobar que su dominio está escrito en el header.
 */
const esperarQueLaImagenCargue = async (imagen: Locator) => {
  await expect(imagen).toBeAttached()
  await expect
    .poll(() => imagen.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
}

// El carrusel de créditos (auto-scroll-carousel.tsx) renderiza cada tarjeta dos
// veces —el segundo juego es el clon aria-hidden que cierra el loop—, así que
// hay dos <img> por miniatura. `.first()` toma la real.
const miniatura = (page: Page, fuente: string): Locator =>
  page.locator(`img[src="${fuente}"]`).first()

// F4 — TikTok era el único proveedor admitido cuya miniatura no tenía host en
// `img-src`: `lib/oembed.ts` acepta sus enlaces, `app/api/oembed/route.ts`
// devuelve el `thumbnail_url` de su CDN, `block-inspector.tsx` lo guarda en
// `credit.image` y `credits-block.tsx` lo pinta en un <img> que el navegador
// bloqueaba. Es la ÚNICA vía por la que una URL de tiktokcdn entra al contenido
// de un perfil, y llega con hosts de los dos dominios de su CDN: se comprueba
// uno por dominio, así quitar cualquiera de los dos de `img-src` pone la
// prueba en rojo.
test("las miniaturas del oEmbed de TikTok se pintan en los créditos (F4)", async ({ page }) => {
  await aislarRedExterna(page)
  const violaciones: string[] = []
  escucharViolaciones(page, violaciones)

  await page.goto(`/${PERFIL_EMBEDS.username}`)

  // Guarda del fixture: si alguien dejara los dos créditos apuntando al mismo
  // dominio, uno de los dos comodines de `img-src` quedaría sin prueba y podría
  // borrarse sin que nada se pusiera rojo.
  const dominioBase = (url: string) => new URL(url).hostname.split(".").slice(-2).join(".")
  expect(new Set(CREDITOS_TIKTOK.map((credito) => dominioBase(credito.image)))).toEqual(
    new Set(["tiktokcdn.com", "tiktokcdn-us.com"])
  )

  for (const credito of CREDITOS_TIKTOK) {
    await esperarQueLaImagenCargue(miniatura(page, credito.image))
  }

  expect(violaciones).toEqual([])
})

// La otra superficie que pinta un clip de TikTok: su tarjeta dentro de
// Publicaciones. Vive en una PESTAÑA propia del perfil público
// (`profile-client.tsx` solo monta los bloques de la pestaña activa, y la
// inicial es "Legado"), así que hay que abrirla como lo haría un visitante —
// cargar la página y buscar el <img> no alcanza, no está en el DOM todavía.
// Su miniatura es de R2, no de tiktokcdn: ahí el editor solo ofrece un
// ImageUploader (`components/inspector/embeds-fields.tsx`), nunca el
// thumbnail del oEmbed.
test("la tarjeta de TikTok de Publicaciones se pinta al abrir su pestaña", async ({ page }) => {
  await aislarRedExterna(page)
  const violaciones: string[] = []
  escucharViolaciones(page, violaciones)

  await page.goto(`/${PERFIL_EMBEDS.username}`)

  const pestaña = page.getByRole("button", { name: "Publicaciones", exact: true })
  await expect(pestaña).toBeVisible()

  // La barra de pestañas viaja en el HTML del servidor, así que un clic
  // anterior a la hidratación no cambia nada. Se reintenta hasta que React
  // toma el control; volver a elegir la pestaña ya activa es inocuo.
  await expect
    .poll(async () => {
      await pestaña.click()
      return miniatura(page, EMBED_TIKTOK_PUBLICACION.thumbnail).count()
    })
    .toBeGreaterThan(0)

  await esperarQueLaImagenCargue(miniatura(page, EMBED_TIKTOK_PUBLICACION.thumbnail))

  expect(violaciones).toEqual([])
})

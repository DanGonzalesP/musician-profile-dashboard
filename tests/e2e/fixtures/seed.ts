import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "@playwright/test"

// Fixtures deterministas de las pruebas E2E.
//
// NADA de esto son datos reales: son dos artistas de mentira que existen sólo
// para que las pruebas tengan qué renderizar. La fuente única de verdad es
// `datos.json`, que también sirve el servidor falso de PostgREST
// (`servidor-supabase.mjs`). Si las specs declararan sus propias constantes,
// una de las dos copias se desincronizaría y las pruebas empezarían a mentir.
//
// Cómo llegan estos datos a la app: `playwright.config.ts` arranca el servidor
// falso y le apunta `NEXT_PUBLIC_SUPABASE_URL`. Así los reciben las DOS
// mitades —el render en servidor y el cliente—, cosa que interceptar sólo el
// navegador nunca conseguiría.

type Fila = Record<string, unknown>

const DATOS = JSON.parse(readFileSync(join(__dirname, "datos.json"), "utf8")) as Record<string, Fila[]>

function fila(tabla: string, predicado: (f: Fila) => boolean): Fila {
  const encontrada = (DATOS[tabla] ?? []).find(predicado)
  if (!encontrada) throw new Error(`Fixture ausente en ${tabla}: revisa tests/e2e/fixtures/datos.json`)
  return encontrada
}

/** El artista visible: el caso feliz de todas las superficies públicas. */
export const PERFIL_FIXTURE = fila("profiles", (f) => f.username === "artista_prueba") as {
  id: string
  username: string
  display_name: string
  bio: string
  profile_type: string
  is_suspended: boolean
}

/** El perfil suspendido: no debe aparecer en NINGUNA superficie pública (P-34). */
export const PERFIL_SUSPENDIDO = fila("profiles", (f) => f.username === "suspendido_prueba") as {
  id: string
  username: string
  display_name: string
  is_suspended: boolean
}

/**
 * El artista con contenido de TikTok: existe para ejercitar las dos superficies
 * públicas que pintan una miniatura de un clip de TikTok. Es un perfil aparte y
 * no `artista_prueba` a propósito, para no mover las instantáneas ARIA y las
 * capturas aprobadas del perfil público, que congelan otra cosa.
 */
export const PERFIL_EMBEDS = fila("profiles", (f) => f.username === "embeds_prueba") as {
  id: string
  username: string
  display_name: string
}

const BLOQUE_CREDITOS_EMBEDS = fila(
  "profile_blocks",
  (f) => f.profile_id === PERFIL_EMBEDS.id && f.block_type === "credits"
) as { content: { credits: { title: string; image: string }[] } }

const BLOQUE_PUBLICACIONES_EMBEDS = fila(
  "profile_blocks",
  (f) => f.profile_id === PERFIL_EMBEDS.id && f.block_type === "publicaciones"
) as { content: { embeds: { title: string; thumbnail: string }[] } }

/**
 * Créditos externos de TikTok — la ÚNICA ruta por la que una URL del CDN de
 * TikTok entra al contenido de un perfil: `app/api/oembed/route.ts` devuelve el
 * `thumbnail_url` del oEmbed, `block-inspector.tsx` lo guarda en `credit.image`
 * y `credits-block.tsx` lo pinta en un <img>. Son dos porque el oEmbed responde
 * con hosts de dos dominios distintos según la región que atienda, y la CSP
 * admite los dos: uno por dominio, así ninguno de los dos queda sin prueba.
 *
 * Los hosts son los de verdad (no un dominio inventado) porque lo que se prueba
 * es la decisión de la CSP sobre ellos; la imagen nunca sale a la red:
 * `aislarRedExterna` la responde localmente.
 */
export const CREDITOS_TIKTOK = BLOQUE_CREDITOS_EMBEDS.content.credits

/**
 * La tarjeta de TikTok dentro de Publicaciones — la otra superficie que pinta
 * un clip de TikTok, pero su miniatura NO viene del oEmbed: el editor solo
 * ofrece ahí un `ImageUploader` (`components/inspector/embeds-fields.tsx`), así
 * que en producción esa URL siempre es de R2. Se deja con esa forma a
 * propósito: ponerle un host de tiktokcdn describiría un dato que la app nunca
 * produce.
 */
export const EMBED_TIKTOK_PUBLICACION = BLOQUE_PUBLICACIONES_EMBEDS.content.embeds[0]

export const HERO_FIXTURE = fila(
  "profile_blocks",
  (f) => f.profile_id === PERFIL_FIXTURE.id && f.block_type === "hero"
) as { content: { name: string; tagline: string; location: string } }

export const SINGLE_FIXTURE = fila(
  "profile_blocks",
  (f) => f.profile_id === PERFIL_FIXTURE.id && f.block_type === "single"
) as { content: { title: string } }

export const PRODUCTO_FIXTURE = fila("products", (f) => f.seller_id === PERFIL_FIXTURE.id) as { title: string }

export const SERVICIO_FIXTURE = fila("services", (f) => f.profile_id === PERFIL_FIXTURE.id) as { title: string }

export const PISTA_FIXTURE = fila("music_feed", (f) => f.profile_id === PERFIL_FIXTURE.id) as { title: string }

export const PISTA_SUSPENDIDA = fila("music_feed", (f) => f.profile_id === PERFIL_SUSPENDIDO.id) as { title: string }

export const PRODUCTO_SUSPENDIDO = fila("products", (f) => f.seller_id === PERFIL_SUSPENDIDO.id) as { title: string }

/**
 * Aísla al navegador de la red real: R2 y cualquier dominio externo que un
 * bloque pudiera pedir (miniaturas de oEmbed, fuentes) se responden localmente.
 * Los datos NO se mockean acá — de eso se encarga el servidor de fixtures, que
 * también atiende al servidor de Next.
 *
 * Una prueba nunca debe depender de que exista `ejemplo.r2.dev`.
 */
export async function aislarRedExterna(page: Page) {
  // PNG transparente de 1×1: satisface `naturalWidth > 0` sin descargar nada.
  const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )

  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const tipo = route.request().resourceType()
    if (tipo === "image" || tipo === "media" || tipo === "font") {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
    }
    // Cualquier otra salida a la red externa se corta: si una prueba la
    // necesitara, tiene que declararlo explícitamente.
    return route.abort()
  })
}

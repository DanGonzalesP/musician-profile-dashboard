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

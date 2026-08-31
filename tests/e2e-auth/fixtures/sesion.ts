import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { expect, type ConsoleMessage, type Page } from "@playwright/test"
import { exigirBaseDeVibe } from "../../../test/database/identidad-de-la-base"

// Arnés del E2E autenticado.
//
// ─── LAS DOS REGLAS QUE NO SE NEGOCIAN ────────────────────────────────────
//
// 1. **Nunca contra producción.** `exigirSupabaseLocal()` aborta si la URL no
//    es de una máquina local. Estas pruebas CREAN Y BORRAN usuarios; correrlas
//    contra la base real sería un incidente, no un fallo de pruebas. Es la
//    misma salvaguarda que `test/database/helpers.ts`, y existe dos veces a
//    propósito: la que se olvida es la que hace daño.
//
// 2. **La service role NUNCA prueba lo que se está probando.** Se usa sólo
//    para crear el usuario efímero y borrarlo. El inicio de sesión es real, a
//    través del formulario, y desde ahí todo lo hace el navegador con la
//    sesión del usuario — que es como habla la aplicación.

const URL_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

function exigir(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) {
    throw new Error(
      [
        `Falta la variable ${nombre}.`,
        "",
        "El E2E autenticado necesita un Supabase LOCAL:",
        "  1. Abre Docker Desktop.",
        "  2. pnpm db:start   ->  imprime la URL y las claves locales.",
        "  3. Cópialas a .env.local como SUPABASE_TEST_URL,",
        "     SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY.",
        "",
        "Son las MISMAS variables que usa `pnpm test:db`.",
      ].join("\n")
    )
  }
  return valor
}

export function exigirSupabaseLocal(): { url: string; anonKey: string; serviceKey: string } {
  const url = exigir("SUPABASE_TEST_URL")
  const origen = new URL(url).origin

  if (!URL_LOCAL.test(origen)) {
    throw new Error(
      [
        `SUPABASE_TEST_URL apunta a ${origen}, que no es una máquina local.`,
        "",
        "Estas pruebas CREAN Y BORRAN usuarios. Se niegan a correr contra",
        "cualquier cosa que no sea el Supabase local de `pnpm db:start`.",
      ].join("\n")
    )
  }

  return {
    url,
    anonKey: exigir("SUPABASE_TEST_ANON_KEY"),
    serviceKey: exigir("SUPABASE_TEST_SERVICE_ROLE_KEY"),
  }
}

/** Cliente administrativo. SÓLO para crear y borrar el usuario efímero. */
function clienteAdministrativo(): SupabaseClient {
  const { url, serviceKey } = exigirSupabaseLocal()
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type UsuarioE2E = {
  id: string
  email: string
  password: string
  profileId: string
  /** Username conocido de antemano: la prueba navega a la URL pública. */
  username: string
  displayName: string
}

let contador = 0

/**
 * Crea un usuario efímero CON su perfil ya montado.
 *
 * El perfil se crea acá y no se deja en manos de `ensureOwnProfile` (que sí
 * corre al iniciar sesión y lo crearía igual) por una razón concreta: aquel
 * genera un username con un sufijo aleatorio, y la prueba necesita saber a qué
 * URL pública navegar para comprobar que lo publicado se ve. Un fixture que no
 * puede predecir su propia URL no sirve.
 */
export async function crearUsuarioE2E(): Promise<UsuarioE2E> {
  const { url } = exigirSupabaseLocal()
  const admin = clienteAdministrativo()

  // "Es localhost" no alcanza: en esta máquina conviven varios Supabase
  // locales y todos firman con el mismo secreto de demostración, así que la
  // clave de servicio autentica igual contra el proyecto equivocado. La
  // comprobación se comparte con las pruebas de base para no tener dos
  // versiones de la misma salvaguarda.
  await exigirBaseDeVibe(admin, url)

  const marca = `${Date.now().toString(36)}${(contador++).toString(36)}`
  const email = `e2e-${marca}@ejemplo.local`
  const password = `E2e-${Math.random().toString(36).slice(2)}-9!`
  // El formato de username lo impone `profiles_username_format`: minúsculas,
  // dígitos y guion bajo, entre 3 y 30 caracteres.
  const username = `e2e_${marca}`.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)
  const displayName = `Artista E2E ${marca}`

  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (errorCrear || !creado.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${errorCrear?.message}`)
  }

  const { data: perfil, error: errorPerfil } = await admin
    .from("profiles")
    .insert({ user_id: creado.user.id, display_name: displayName, username, profile_type: "artist" })
    .select("id")
    .single()
  if (errorPerfil || !perfil) {
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {})
    throw new Error(`No se pudo crear el perfil de prueba: ${errorPerfil?.message}`)
  }

  return { id: creado.user.id, email, password, profileId: perfil.id as string, username, displayName }
}

/**
 * Limpieza determinista. El borrado del perfil es explícito y no una cascada:
 * `profiles.user_id` no tiene clave foránea contra `auth.users` (sólo
 * `owner_user_id` la tiene), así que borrar la cuenta dejaría el perfil
 * individual huérfano. Es el mismo desajuste que documenta `0013` en
 * `eliminar_mi_cuenta_impl`. Todo lo demás cae por ON DELETE CASCADE.
 */
export async function borrarUsuarioE2E(usuario: UsuarioE2E | undefined): Promise<void> {
  if (!usuario) return
  const admin = clienteAdministrativo()
  await admin.from("profiles").delete().or(`user_id.eq.${usuario.id},owner_user_id.eq.${usuario.id}`)
  await admin.auth.admin.deleteUser(usuario.id).catch(() => {})
}

/**
 * Inicia sesión DE VERDAD, por el formulario. No se inyecta una cookie ni se
 * fabrica un token: el navegador recibe exactamente la sesión que recibirá en
 * producción, con los mismos claims, y `proxy.ts` la lee de la misma cookie.
 */
export async function iniciarSesion(page: Page, usuario: UsuarioE2E, destino = "/dashboard"): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destino)}`)

  await page.locator('input[type="email"]').fill(usuario.email)
  await page.locator('input[type="password"]').fill(usuario.password)
  await page.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).first().click()

  // La barrera del borde es `proxy.ts`: si la cookie de sesión no se hubiera
  // escrito, esta espera terminaría de vuelta en /login.
  await page.waitForURL(`**${destino}`, { timeout: 30_000 })

  // El banner de consentimiento tapa la barra inferior del editor en móvil.
  await descartarConsentimiento(page)
}

/**
 * Token de acceso real del usuario, para llamar a las rutas de API igual que
 * lo hace el navegador (`authedFetch` manda `Authorization: Bearer`).
 *
 * Se obtiene iniciando sesión de verdad con anon key, no fabricándolo: el JWT
 * lleva exactamente los claims que llevará en producción, y `RLS` lo evalúa
 * igual. La clave de servicio no interviene.
 */
export async function tokenDeAcceso(usuario: UsuarioE2E): Promise<string> {
  const { url, anonKey } = exigirSupabaseLocal()
  const cliente = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await cliente.auth.signInWithPassword({
    email: usuario.email,
    password: usuario.password,
  })
  if (error || !data.session) throw new Error(`No se pudo obtener el token: ${error?.message}`)
  return data.session.access_token
}

/**
 * Descarta el banner de consentimiento de cookies, eligiendo **"Solo lo
 * necesario"**: la opción que deja Vercel Analytics apagado.
 *
 * No es maquillaje para que pasen las pruebas. En móvil el banner es una
 * franja fija al fondo con `z-60`, justo encima de la barra de acciones del
 * editor, así que intercepta los clics sobre "Bloques" y "Publicar" hasta que
 * alguien responde. Un usuario real responde; la prueba también tiene que
 * hacerlo, o estaría midiendo una pantalla que ningún artista llega a ver.
 *
 * Es tolerante a que no aparezca: la decisión se recuerda por contexto de
 * navegador, así que en la segunda navegación de una misma prueba ya no está.
 */
export async function descartarConsentimiento(page: Page): Promise<void> {
  const soloNecesario = page.getByRole("button", { name: /solo lo necesario/i })
  if (await soloNecesario.isVisible().catch(() => false)) {
    await soloNecesario.click()
    await expect(soloNecesario).toBeHidden()
  }
}

/**
 * Cierra el inspector si está tapando el lienzo.
 *
 * En escritorio (xl+) el inspector es una columna fija que convive con el
 * lienzo y no estorba a nadie. Por debajo de xl es un cajón a pantalla
 * completa que se abre solo al agregar o seleccionar un bloque, y mientras
 * está abierto tapa los controles de orden del bloque. El botón de cerrar
 * existe justamente para eso — es lo que haría el artista antes de reordenar.
 */
export async function cerrarInspector(page: Page): Promise<void> {
  const cerrar = page.getByRole("button", { name: /cerrar y volver al lienzo/i })
  if (await cerrar.isVisible().catch(() => false)) {
    await cerrar.click()
    await expect(cerrar).toBeHidden()
  }
}

/**
 * Deja la biblioteca de bloques a la vista, sea cual sea el ancho.
 *
 * En escritorio (xl+) es un panel fijo y no hay nada que hacer. Por debajo de
 * xl es un cajón que se abre con el botón "Bloques" de la barra inferior — el
 * diseño estilo TikTok/Instagram que acerca las dos acciones principales al
 * pulgar. Sin esto, cualquier prueba que agregue un bloque falla en móvil
 * buscando un botón que existe pero está oculto.
 */
export async function abrirBibliotecaDeBloques(page: Page): Promise<void> {
  const primerTile = page.getByRole("button", { name: /agregar bloque/i }).first()
  const botonCajonMovil = page.getByRole("button", { name: /^bloques$/i })

  // Se espera a que aparezca CUALQUIERA de las dos formas de la biblioteca: el
  // panel fijo de escritorio o el botón que abre el cajón en móvil. Así el
  // ayudante no depende de cuál de los dos monte antes.
  //
  // No se puede usar `toBeAttached` sobre el tile: por debajo de xl el panel
  // lleva `hidden` (o sea `display:none`), y un elemento así queda FUERA del
  // árbol de accesibilidad — `getByRole` no lo encuentra ni siquiera para
  // decir que existe.
  await expect(primerTile.or(botonCajonMovil).first()).toBeVisible({ timeout: 30_000 })

  if (await primerTile.isVisible()) return

  await botonCajonMovil.click()
  await expect(primerTile).toBeVisible()
}

/**
 * ¿Estamos en el diseño móvil? Se decide por el ancho real del viewport, que
 * es exactamente el criterio del `xl:` de Tailwind (1280 px).
 */
export async function esDiseñoMovil(page: Page): Promise<boolean> {
  const ancho = page.viewportSize()?.width ?? 0
  return ancho < 1280
}

/** PNG transparente de 1x1: satisface `naturalWidth > 0` sin descargar nada. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

/**
 * Intercepta la ÚNICA frontera externa que toca el editor: R2.
 *
 * El archivo va directo del navegador a R2 con la URL firmada que devuelve
 * `/api/upload-url` (ver `uploadFileToStorage` en profile-editor.tsx). Se
 * responde ese PUT localmente para no escribir un objeto real que después
 * nadie borraría.
 *
 * Lo que NO se intercepta, a propósito: `/api/upload-url` (que firma de
 * verdad, valida de verdad y registra la propiedad en `media_assets` de
 * verdad), la autenticación, ni ninguna consulta a la base. Simular eso sería
 * probar el mock.
 *
 * Devuelve la lista de PUT observados, para poder afirmar que la subida
 * ocurrió y contra qué origen.
 */
export async function aislarR2(page: Page): Promise<{ puts: string[] }> {
  const puts: string[] = []

  // ─── EL ORDEN DE REGISTRO IMPORTA ─────────────────────────────────────
  // Playwright resuelve con la ÚLTIMA ruta registrada que coincida, no con la
  // más específica. Con el corta-todo al final, era él quien atendía el PUT a
  // R2 y lo abortaba: la publicación moría con `TypeError: Failed to fetch` y
  // `puts` quedaba vacío aunque todo lo demás estuviera bien. El corta-todo va
  // primero, y las reglas concretas después, para que ganen ellas.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const tipo = route.request().resourceType()
    if (tipo === "image" || tipo === "media" || tipo === "font") {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
    }
    // Cualquier otra salida a internet se corta. Si una prueba la necesitara,
    // tiene que declararlo explícitamente.
    return route.abort()
  })

  // La lectura pública de lo ya subido: el editor y el perfil pintan la imagen
  // recién subida desde NEXT_PUBLIC_R2_PUBLIC_URL.
  await page.route(/^https:\/\/r2-publico-de-prueba\.localhost\//, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
  )

  // El PUT firmado. El patrón cubre el endpoint desnudo Y el host con el
  // bucket delante (`vibe-e2e.r2-de-prueba.localhost`), porque el SDK de S3
  // firma en estilo virtual-hosted.
  await page.route(/^https:\/\/([a-z0-9-]+\.)?r2-de-prueba\.localhost\//, async (route) => {
    puts.push(route.request().url())
    await route.fulfill({ status: 200, body: "" })
  })

  return { puts }
}

/**
 * Ruido de consola que no es de Vibe y no puede corregirse desde el
 * repositorio. La lista es corta y explícita a propósito: cada entrada que se
 * agregue sin justificar convierte el gate de "cero errores de consola" en
 * decoración.
 */
const RUIDO_ACEPTADO = [
  // Aviso del propio React en desarrollo.
  /Download the React DevTools/i,
  // `next dev` avisa de su compilación incremental y del refresco rápido.
  /\[Fast Refresh\]/i,
  // Chromium avisa cuando una petición interceptada se corta; es exactamente
  // lo que `aislarR2` hace a propósito con la red externa.
  /net::ERR_FAILED/i,
  /Failed to load resource/i,
]

export type VigilanteDeConsola = {
  /** Mensajes de error o advertencia que no están en la lista de ruido. */
  problemas: string[]
}

/**
 * Recoge errores y advertencias de la consola del navegador, y las excepciones
 * no capturadas de la página.
 *
 * Es un criterio de aceptación de F8: "cero errores o warnings de consola".
 * Una advertencia de React sobre claves duplicadas o un efecto mal puesto es
 * la señal temprana de un bug real, y se pierde si nadie la mira.
 */
export function vigilarConsola(page: Page): VigilanteDeConsola {
  const problemas: string[] = []

  const anotar = (texto: string) => {
    if (RUIDO_ACEPTADO.some((patron) => patron.test(texto))) return
    problemas.push(texto)
  }

  page.on("console", (mensaje: ConsoleMessage) => {
    if (mensaje.type() !== "error" && mensaje.type() !== "warning") return
    anotar(`[console.${mensaje.type()}] ${mensaje.text()}`)
  })

  page.on("pageerror", (error) => anotar(`[pageerror] ${error.message}`))

  return { problemas }
}

/** Afirma que la consola quedó limpia, mostrando qué se encontró si no. */
export function esperarConsolaLimpia(vigilante: VigilanteDeConsola): void {
  expect(vigilante.problemas, vigilante.problemas.join("\n")).toEqual([])
}

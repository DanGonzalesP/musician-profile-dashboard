import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { expect, test } from "@playwright/test"
import { aislarR2, descartarConsentimiento, exigirSupabaseLocal } from "../e2e-auth/fixtures/sesion"

// Instantánea ARIA del editor autenticado, en los cuatro anchos.
//
// ─── POR QUÉ UNA IDENTIDAD FIJA Y NO UN USUARIO EFÍMERO ───────────────────
// Las demás pruebas autenticadas usan usuarios con nombre aleatorio, y está
// bien: lo que afirman no depende del nombre. Una instantánea ARIA sí — el
// nombre del artista y su username aparecen DENTRO de la estructura que se
// congela. Con un usuario aleatorio, la referencia cambiaría en cada corrida y
// no serviría para nada.
//
// Así que este usuario tiene identidad fija y se recrea desde cero antes de
// cada corrida. El borrado previo importa tanto como la creación: si una
// corrida anterior murió a mitad, su fila seguiría ahí con otro contenido.

const USUARIO = {
  email: "instantanea-editor@ejemplo.local",
  password: "Instantanea-Editor-9!",
  username: "instantanea_editor",
  displayName: "Artista de Instantánea",
}

function admin(): SupabaseClient {
  const { url, serviceKey } = exigirSupabaseLocal()
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Borra el usuario de identidad fija, exista o no. Idempotente. */
async function borrarUsuarioFijo(): Promise<void> {
  const cliente = admin()
  const { data } = await cliente.auth.admin.listUsers({ page: 1, perPage: 200 })
  const previo = data?.users?.find((u) => u.email === USUARIO.email)
  if (!previo) return

  await cliente.from("profiles").delete().or(`user_id.eq.${previo.id},owner_user_id.eq.${previo.id}`)
  await cliente.auth.admin.deleteUser(previo.id).catch(() => {})
}

test.beforeAll(async () => {
  await borrarUsuarioFijo()

  const cliente = admin()
  const { data: creado, error } = await cliente.auth.admin.createUser({
    email: USUARIO.email,
    password: USUARIO.password,
    email_confirm: true,
  })
  if (error || !creado.user) throw new Error(`No se pudo crear el usuario fijo: ${error?.message}`)

  const { error: errorPerfil } = await cliente.from("profiles").insert({
    user_id: creado.user.id,
    display_name: USUARIO.displayName,
    username: USUARIO.username,
    profile_type: "artist",
  })
  if (errorPerfil) throw new Error(`No se pudo crear el perfil fijo: ${errorPerfil.message}`)
})

test.afterAll(async () => {
  await borrarUsuarioFijo()
})

test("editor autenticado — estructura ARIA estable", async ({ page }) => {
  await aislarR2(page)

  await page.goto("/login?redirect=%2Fdashboard")
  await page.locator('input[type="email"]').fill(USUARIO.email)
  await page.locator('input[type="password"]').fill(USUARIO.password)
  await page.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).first().click()
  await page.waitForURL("**/dashboard", { timeout: 30_000 })

  // El banner de consentimiento se responde antes de capturar: si no, la
  // instantánea congelaría una pantalla con un diálogo encima que el artista
  // sólo ve una vez.
  await descartarConsentimiento(page)

  // El editor terminó de montar cuando el lienzo pintó el banner principal.
  await expect(page.locator('[data-bloque-de-lienzo="hero"]')).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState("networkidle")

  await expect(page.locator("body")).toMatchAriaSnapshot({ name: "editor.aria.yml" })
})

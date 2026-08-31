import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "node:fs"

delete process.env.NO_COLOR

// Regresión visual del EDITOR AUTENTICADO, en los cuatro anchos.
//
// Es la pieza que le faltaba a la capa visual: `playwright.visual.config.ts`
// congela las superficies públicas contra el servidor de fixtures, pero el
// editor exige sesión y ahí no la hay. Sin esto, el componente más grande y
// más frágil del proyecto —`block-inspector.tsx` y `profile-editor.tsx` suman
// casi 4 000 líneas— era justo el que nadie podía refactorizar con red.
//
// Misma doctrina que la suite visual pública:
//   • la instantánea ARIA es determinista y se compara en todo sistema;
//   • la capa de píxeles no se genera acá — sigue siendo una decisión humana.
//
// Necesita Docker y el Supabase local, igual que `pnpm test:db` y
// `pnpm test:e2e:auth`.

const PORT = Number(process.env.E2E_VISUAL_AUTH_PORT ?? 3300)
const baseURL = `http://127.0.0.1:${PORT}`
const CI = !!process.env.CI

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const urlSupabase = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54421"
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? ""

const ANCHOS = [390, 768, 1024, 1440]

export default defineConfig({
  testDir: "./tests/visual-auth",

  // Un solo usuario de identidad fija compartido por los cuatro anchos: en
  // paralelo se pisarían entre ellos al crearlo y borrarlo.
  fullyParallel: false,
  workers: 1,

  forbidOnly: CI,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },

  use: { baseURL, actionTimeout: 15_000 },

  // Sin `{platform}`: la instantánea ARIA es idéntica en todo sistema
  // operativo y tiene que compararse igual en Windows y en el CI de Linux.
  snapshotPathTemplate: "tests/visual-auth/referencias/{projectName}/{arg}{ext}",

  projects: ANCHOS.map((w) => ({
    name: `w${w}`,
    use: { ...devices["Desktop Chrome"], viewport: { width: w, height: 900 } },
  })),

  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `${baseURL}/legal`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: urlSupabase,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_SITE_URL: baseURL,
      // R2 de mentira: el editor no sube nada en esta suite, pero
      // `/api/upload-url` tiene que poder existir sin fallar cerrado.
      R2_ENDPOINT: "https://r2-de-prueba.localhost",
      R2_ACCESS_KEY_ID: "clave-de-prueba-sin-valor-real",
      R2_SECRET_ACCESS_KEY: "secreto-de-prueba-sin-valor-real",
      R2_BUCKET_NAME: "vibe-e2e",
      NEXT_PUBLIC_R2_PUBLIC_URL: "https://r2-publico-de-prueba.localhost",
    },
  },
})

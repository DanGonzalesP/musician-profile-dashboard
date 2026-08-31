import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "node:fs"

delete process.env.NO_COLOR

// E2E AUTENTICADO (F8). El complemento que faltaba a `playwright.config.ts`.
//
// ─── POR QUÉ ES UNA CONFIGURACIÓN APARTE ──────────────────────────────────
// La suite pública corre contra un PostgREST de mentira
// (`tests/e2e/fixtures/servidor-supabase.mjs`): de sólo lectura, sin auth, sin
// Docker. Eso fue deliberado y sigue siéndolo — es lo que permite que
// `pnpm test:e2e` corra en cualquier máquina y en CI sin una sola credencial.
//
// Pero el editor no se puede probar así. Falsificar un JWT válido significaría
// reimplementar GoTrue entero o meter una credencial en el repositorio, y
// ninguna de las dos cosas prueba lo que hay que probar: que un usuario REAL,
// con una sesión REAL, escribe en una base REAL con RLS encendida.
//
// La respuesta es el mismo Supabase local que ya usan las pruebas de base
// (`pnpm test:db`). Docker, sí; credenciales reales, no; datos de producción,
// jamás. `tests/e2e-auth/fixtures/sesion.ts` se niega a arrancar si la URL no
// es de una máquina local.
//
// ─── LO ÚNICO QUE SE SIMULA ES LA FRONTERA EXTERNA ────────────────────────
// R2 es el único tercero que se intercepta, y sólo en el navegador: el PUT
// firmado que sube el archivo. La autenticación, la base, el rate limit, RLS y
// las rutas de API son todas de verdad. Simular R2 evita escribir objetos que
// después nadie borra; simular cualquier otra cosa sería probar el mock.

const PORT = Number(process.env.E2E_AUTH_PORT ?? 3200)
const baseURL = `http://127.0.0.1:${PORT}`
const CI = !!process.env.CI

// Las credenciales del Supabase local llegan por `.env.local` (máquina de
// desarrollo) o directamente por `process.env` (CI). Son las MISMAS variables
// que usa `pnpm test:db`, para no tener dos fuentes de verdad que se
// desincronicen.
if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const urlSupabase = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321"
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? ""

// R2 de mentira. No apunta a ningún bucket real y no necesita hacerlo: el
// firmado del AWS SDK es criptografía local, sin red. El PUT que el navegador
// hace contra este origen lo intercepta `aislarR2()`.
//
// Tienen que estar las cinco, o `/api/upload-url` responde 503 por su propia
// comprobación fail-closed (lib/r2-config.ts) y la prueba de subida no
// probaría la subida, sino el fail-closed. Ese caso tiene su propia prueba.
const entornoR2 = {
  R2_ENDPOINT: "https://r2-de-prueba.localhost",
  R2_ACCESS_KEY_ID: "clave-de-prueba-sin-valor-real",
  R2_SECRET_ACCESS_KEY: "secreto-de-prueba-sin-valor-real",
  R2_BUCKET_NAME: "vibe-e2e",
  NEXT_PUBLIC_R2_PUBLIC_URL: "https://r2-publico-de-prueba.localhost",
}

export default defineConfig({
  testDir: "./tests/e2e-auth",

  // Secuencial a propósito. Comparten UNA base: dos archivos en paralelo se
  // cruzan los usuarios efímeros y la limpieza de uno borra el sujeto del
  // otro. Es la misma decisión que `fileParallelism: false` en
  // vitest.db.config.mjs, y por el mismo motivo.
  fullyParallel: false,
  workers: 1,

  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [["html", { open: "never" }], ["list"]] : "list",

  // El editor carga perfil, bloques y catálogo antes de pintar; publicar
  // encadena varias escrituras. 30 s no alcanzan de forma holgada.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 15_000,
  },

  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  ],

  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `${baseURL}/legal`,
    // Nunca reutilizar un servidor de una corrida anterior: serviría código y
    // variables viejas y la suite fallaría por todos lados sin que nada del
    // repositorio esté mal. Es la lección que ya está escrita en
    // playwright.config.ts.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: urlSupabase,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_SITE_URL: baseURL,
      ...entornoR2,
    },
  },
})

import { defineConfig, devices } from "@playwright/test"

// Algunos entornos de terminal inyectan NO_COLOR y Playwright fuerza color;
// Node advierte por cada proceso hijo cuando coexisten. No cambia resultados,
// sólo evita ruido que podría ocultar una advertencia real del navegador.
delete process.env.NO_COLOR

// Configuración E2E (F8). Congela la UX y la accesibilidad ANTES de tocar el
// render (bloque D). Es el contrato de no regresión del plan.
//
// PRINCIPIO CLAVE: estas pruebas no dependen de datos reales, ni de Supabase
// local, ni de Docker, ni de una sola credencial. `NEXT_PUBLIC_SUPABASE_URL`
// apunta a un PostgREST de mentira (tests/e2e/fixtures/servidor-supabase.mjs)
// que sirve tests/e2e/fixtures/datos.json.
//
// Por qué así y no con page.route: apuntando la variable, los fixtures los
// reciben las DOS mitades de la app —el render en servidor (generateMetadata,
// Server Components, sitemap) y el navegador—. Interceptar sólo el navegador
// deja ciega justamente la mitad que el bloque D del plan modifica.

const PORT = Number(process.env.E2E_PORT ?? 3100)
const PUERTO_SUPABASE = Number(process.env.E2E_SUPABASE_PORT ?? 54999)
const baseURL = `http://127.0.0.1:${PORT}`
const urlSupabaseFalso = `http://127.0.0.1:${PUERTO_SUPABASE}`
const CI = !!process.env.CI

// La anon key es de relleno a propósito: el servidor de fixtures no valida
// JWT. Que no haya ninguna clave real en juego es parte del diseño.
const envRelleno = {
  NEXT_PUBLIC_SUPABASE_URL: urlSupabaseFalso,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-relleno-para-e2e",
  NEXT_PUBLIC_R2_PUBLIC_URL: "https://ejemplo.r2.dev",
  NEXT_PUBLIC_SITE_URL: baseURL,
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    // Sin animaciones: evita capturas y esperas frágiles.
    actionTimeout: 10_000,
  },

  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  ],

  webServer: [
    {
      command: `node tests/e2e/fixtures/servidor-supabase.mjs ${PUERTO_SUPABASE}`,
      url: `${urlSupabaseFalso}/__salud`,
      // Siempre se arranca fresco, también en local. Reutilizar un servidor ya
      // levantado ahorra unos segundos y cuesta horas: un `next dev` que quedó
      // vivo de una corrida anterior sirve código y variables viejas, y la
      // suite falla por todos lados sin que nada del repositorio esté mal.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev -p ${PORT}`,
      // La sonda apunta a una página estática (/legal): no depende de datos y
      // responde 200 en cuanto Next termina de compilar.
      url: `${baseURL}/legal`,
      // Siempre se arranca fresco, también en local. Reutilizar un servidor ya
      // levantado ahorra unos segundos y cuesta horas: un `next dev` que quedó
      // vivo de una corrida anterior sirve código y variables viejas, y la
      // suite falla por todos lados sin que nada del repositorio esté mal.
      reuseExistingServer: false,
      timeout: 180_000,
      env: envRelleno,
    },
  ],
})

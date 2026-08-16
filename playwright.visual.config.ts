import { defineConfig, devices } from "@playwright/test"

delete process.env.NO_COLOR

// Regresión visual (F8). Separada del E2E funcional a propósito: son el "antes"
// contra el que el bloque D (render en servidor) demuestra que no cambió un
// píxel. Las referencias de píxeles las APRUEBA una persona (acción humana #9
// del plan): definen oficialmente "así se ve Vibe". Este agente no las
// fabrica ni las commitea.
//
// Capturas por ancho: 390 (móvil), 768 (tablet), 1024 y 1440 (escritorio).
// Playwright ya sufija cada referencia por plataforma (`-win32.png`,
// `-linux.png`): las métricas de fuente difieren entre Windows y Linux, así que
// una referencia de Windows no se compara contra una corrida en Linux (CI).
// Por eso el gate de píxeles se valida en local (Windows) y en CI sólo corre la
// capa ARIA determinista (ver tests/visual/capture.spec.ts).

const PORT = Number(process.env.E2E_PORT ?? 3100)
const PUERTO_SUPABASE = Number(process.env.E2E_SUPABASE_PORT ?? 54999)
const baseURL = `http://127.0.0.1:${PORT}`
const urlSupabaseFalso = `http://127.0.0.1:${PUERTO_SUPABASE}`
const CI = !!process.env.CI

// Mismos fixtures que el E2E funcional: la referencia visual tiene que
// capturar SIEMPRE el mismo contenido, o la comparación de píxeles no
// significa nada.
const envRelleno = {
  NEXT_PUBLIC_SUPABASE_URL: urlSupabaseFalso,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-relleno-para-e2e",
  NEXT_PUBLIC_R2_PUBLIC_URL: "https://ejemplo.r2.dev",
  NEXT_PUBLIC_SITE_URL: baseURL,
}

const ANCHOS = [390, 768, 1024, 1440]

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  reporter: "list",
  timeout: 30_000,

  // Tolerancia mínima al ruido de subpíxel; una diferencia real de layout la
  // supera de largo.
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },

  use: { baseURL },

  // Ruta explícita y predecible de cada referencia. SIN `{platform}` a
  // propósito: la instantánea ARIA es idéntica en todo sistema operativo y
  // tiene que compararse igual en Windows y en el CI de Linux. Quien sí
  // necesita el sufijo de plataforma es la captura de píxeles, y lo lleva en
  // su propio nombre de archivo (ver tests/visual/capture.spec.ts).
  snapshotPathTemplate: "tests/visual/referencias/{projectName}/{arg}{ext}",

  projects: ANCHOS.map((w) => ({
    name: `w${w}`,
    use: { ...devices["Desktop Chrome"], viewport: { width: w, height: 900 } },
  })),

  webServer: [
    {
      command: `node tests/e2e/fixtures/servidor-supabase.mjs ${PUERTO_SUPABASE}`,
      url: `${urlSupabaseFalso}/__salud`,
      // Igual que en playwright.config.ts: nunca reutilizar un servidor de una
      // corrida anterior. Una referencia visual tomada contra código viejo es
      // peor que no tener referencia.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev -p ${PORT}`,
      url: `${baseURL}/legal`,
      // Igual que en playwright.config.ts: nunca reutilizar un servidor de una
      // corrida anterior. Una referencia visual tomada contra código viejo es
      // peor que no tener referencia.
      reuseExistingServer: false,
      timeout: 180_000,
      env: envRelleno,
    },
  ],
})

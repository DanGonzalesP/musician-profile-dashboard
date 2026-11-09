import { defineConfig } from "@playwright/test"
import authConfig from "./playwright.auth.config"

// El arnés crea workerd y entrega su puerto efímero. Nunca aceptar staging.
const baseURL = process.env.WORKER_AUTH_URL
if (!baseURL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(baseURL)) {
  throw new Error("Ejecutar mediante pnpm cf:test:auth, sólo contra Worker local")
}

export default defineConfig({
  ...authConfig,
  webServer: undefined,
  // Sólo este navegador efímero acepta el certificado local de un día.
  use: { ...authConfig.use, baseURL, ignoreHTTPSErrors: true, trace: "retain-on-failure" },
})

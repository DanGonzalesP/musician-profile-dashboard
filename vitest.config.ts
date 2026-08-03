import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      // Mismo alias que tsconfig.json, para que las pruebas resuelvan los
      // imports "@/lib/..." igual que la app.
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
    // lib/supabase.ts crea el cliente al importarse, así que cualquier módulo
    // que lo importe —aunque las funciones bajo prueba sean puras— revienta
    // sin estas variables. Son de relleno: las pruebas no tocan la red.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-relleno-para-pruebas",
      NEXT_PUBLIC_R2_PUBLIC_URL: "https://ejemplo.r2.dev",
    },
  },
})

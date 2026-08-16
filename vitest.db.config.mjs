import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"

// Configuración separada para las pruebas de BASE DE DATOS.
//
// Por qué no van en `vitest.config.mts` con el resto: son de otra naturaleza.
// Las unitarias son puras, corren en milisegundos y no tocan nada. Estas
// levantan usuarios reales contra un Postgres real, tardan segundos y
// comparten una única base. Mezclarlas haría que `pnpm test` —el gate que se
// corre veinte veces al día— dependiera de tener Docker levantado.
//
// Patrón tomado de `Bancary/vitest.db.config.mjs`, que ya sostiene 14 archivos
// de este tipo.

export default defineConfig(() => {
  // Vitest no inyecta variables sin prefijo VITE_ automáticamente. Node carga
  // .env.local si existe y después filtramos estrictamente SUPABASE_TEST_*;
  // en CI, las mismas variables llegan directamente por process.env.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local")
  const entornoPruebas = Object.fromEntries(
    Object.entries(process.env).filter(([nombre, valor]) => nombre.startsWith("SUPABASE_TEST_") && valor)
  )

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./", import.meta.url)),
      },
    },
    test: {
      include: ["test/database/**/*.test.ts"],
      environment: "node",
      // Comparten UNA base. En paralelo, el usuario efímero de un archivo se
      // cruza con el `delete` de limpieza de otro y los fallos son
      // irreproducibles. Secuencial es más lento y es la decisión correcta.
      fileParallelism: false,
      // Crear un usuario contra Auth, esperar el JWT y hacer varias consultas no
      // entra en los 5 s por defecto.
      testTimeout: 30_000,
      hookTimeout: 30_000,
      // Solo se inyectan las credenciales del Supabase local. Las salvaguardas
      // de helpers.ts rechazan cualquier URL que no sea localhost.
      env: entornoPruebas,
    },
  }
})

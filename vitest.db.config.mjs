import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

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

export default defineConfig({
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
    // Estas pruebas hablan con la red local: no se les inyectan las variables
    // de relleno de vitest.config.mts. Leen SUPABASE_TEST_* del entorno y
    // abortan con un mensaje claro si faltan (ver test/database/helpers.ts).
    env: {},
  },
})

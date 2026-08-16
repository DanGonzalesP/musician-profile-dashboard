// Gate de base de datos: reconstruye el esquema DESDE CERO y lo audita.
//
// Qué demuestra: que `supabase/migrations/` es suficiente por sí solo para
// levantar la base de Vibe. Mientras el esquema viva a medias en migraciones y
// a medias en SQL corrido a mano en el editor de producción (P-14), nadie
// puede afirmar eso — y sin poder afirmarlo, las pruebas de RLS de F7 estarían
// verificando una base que no se parece a la real.
//
// Adaptado de `Bancary/scripts/verify-db.mjs`, que ya lleva 34 migraciones
// funcionando con este patrón.
//
// REQUISITO: Docker Desktop corriendo. La CLI de Supabase levanta Postgres en
// un contenedor. Sin Docker, este script no puede hacer nada: lo dice y sale
// con un código distinto de 0 para que el CI no lo dé por bueno.

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const cliSupabase = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url))

if (!existsSync(cliSupabase)) {
  console.error(
    [
      "No se encontró la CLI de Supabase en node_modules.",
      "Instálala con:  pnpm add -D supabase",
      "(está declarada en devDependencies; si falta, corre `pnpm install`)",
    ].join("\n")
  )
  process.exit(1)
}

function comprobarDocker() {
  const r = spawnSync("docker", ["info"], { stdio: "ignore", shell: process.platform === "win32" })
  if (r.status !== 0) {
    console.error(
      [
        "Docker no responde.",
        "",
        "La CLI de Supabase levanta Postgres en un contenedor, así que sin Docker",
        "no hay entorno local que verificar. Abre Docker Desktop y vuelve a intentarlo.",
        "",
        "Esto es el bloqueo #8 de la §8 del PLAN_VIBE_EMPRESARIAL.md.",
      ].join("\n")
    )
    process.exit(1)
  }
}

function correr(args, { ocultarSalida = false, descripcion } = {}) {
  if (descripcion) console.log(`\n▶ ${descripcion}`)

  const r = spawnSync(process.execPath, [cliSupabase, ...args], {
    stdio: ocultarSalida ? ["ignore", "ignore", "inherit"] : "inherit",
  })

  if (r.error) {
    console.error(`No se pudo ejecutar la CLI de Supabase: ${r.error.message}`)
    process.exit(1)
  }

  if (r.status !== 0) {
    if (ocultarSalida) {
      console.error("Falló al iniciar Supabase local. Corre `pnpm db:start` para ver el detalle.")
    }
    process.exit(r.status ?? 1)
  }
}

comprobarDocker()

// `supabase start` imprime las claves locales aunque termine bien. Se silencia
// su stdout: no hay razón para copiar credenciales —aunque sean de juguete— a
// los registros de CI, donde quedan indexadas para siempre.
correr(["start"], { ocultarSalida: true, descripcion: "Levantando Supabase local" })

// La prueba de fuego: tirar la base y reconstruirla solo con las migraciones.
// Si alguna migración no es idempotente, depende de datos previos, o el
// esquema real tiene algo que ninguna migración crea, aquí revienta.
correr(["db", "reset", "--local", "--no-seed"], {
  descripcion: "Reconstruyendo el esquema desde cero con supabase/migrations/",
})

// El linter de Supabase detecta lo que las pruebas no ven: políticas de RLS
// que se anulan entre sí, funciones `security definer` sin `search_path` fijo,
// tablas expuestas sin RLS. `--fail-on error` lo convierte en un gate.
correr(["db", "lint", "--local", "--schema", "public", "--level", "warning", "--fail-on", "error"], {
  descripcion: "Auditando el esquema (db lint)",
})

console.log(
  [
    "",
    "✅ La base se reconstruye desde cero solo con supabase/migrations/.",
    "",
    "Lo que esto NO demuestra todavía: que el esquema local sea igual al de",
    "producción. Eso lo prueba `supabase db diff --linked`, que exige `supabase link`",
    "y es criterio de aceptación de F6 (§8, acción humana #8).",
  ].join("\n")
)

// Ejecutar dentro de la copia de scripts/preparar-verificacion.mjs.
// Las credenciales efímeras viajan sólo a los procesos de pruebas, nunca al log.
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { prepararModeradorE2E } from "./moderador-e2e.mjs"
import { prepararReciboMediaE2E } from "./recibo-media-e2e.mjs"
import { leerSupabaseLocal } from "./supabase-local.mjs"

const gate = process.argv[2] ?? "test:db"
if (!["test:db", "test:e2e:auth", "test:visual:auth", "cf:test:auth"].includes(gate)) throw new Error("Gate no permitido")
if (existsSync(".env.local")) throw new Error("Usa una copia aislada sin .env.local")
const config = readFileSync("supabase/config.toml", "utf8")
if (!/^project_id = "vibe"$/m.test(config) || !/^port = 54421$/m.test(config)) {
  throw new Error("Sólo se permite el Supabase local de Vibe en 54421")
}
const local = await leerSupabaseLocal().catch(() => { throw new Error("Supabase local de Vibe no está disponible") })
if (["--docker", "--docker-dependencias"].includes(process.argv[3])) {
  const container = process.argv[3] === "--docker" ? "vibe-auditoria-cloudflare" : "vibe-auditoria-dependencias"
  process.env.SUPABASE_TEST_URL = local.API_URL
  const receipt = ["test:e2e:auth", "cf:test:auth"].includes(gate) ? prepararReciboMediaE2E({ allowInherited: false }) : null
  let moderator
  let code = 1
  try {
    moderator = ["test:e2e:auth", "cf:test:auth"].includes(gate) ? await prepararModeradorE2E(local) : null
    const result = spawnSync("docker", ["exec", "-i", container, "node", "scripts/probar-auth-contenedor.mjs", gate], {
      input: JSON.stringify({ url: local.API_URL, anon: local.ANON_KEY, service: local.SERVICE_ROLE_KEY,
        receiptKey: receipt?.key, receiptKeyId: receipt?.keyId, anonymousKey: receipt?.anonymousKey, moderator: moderator?.user }),
      stdio: ["pipe", "inherit", "inherit"],
    })
    code = result.status ?? 1
  } finally { try { receipt?.cleanup() } finally { await moderator?.cleanup() } }
  process.exit(code)
}
const moderator = gate === "test:e2e:auth" ? await prepararModeradorE2E(local) : null
let result
try { result = spawnSync("pnpm", [gate], {
  shell: process.platform === "win32", stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_TEST_URL: local.API_URL,
    SUPABASE_TEST_ANON_KEY: local.ANON_KEY,
    SUPABASE_TEST_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    ...(moderator ? { SUPABASE_TEST_MODERATOR_JSON: JSON.stringify(moderator.user) } : {}),
  },
})
} finally { await moderator?.cleanup() }
process.exit(result.status ?? 1)

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
// No heredar credenciales ni variables del arnés de pruebas. Wrangler recibe
// explícitamente un archivo de nombres vacíos, nunca .env.local/.dev.vars.
const inherited = new Set(["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"])
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => inherited.has(key.toUpperCase())))
Object.assign(env, {
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
})
const result = spawnSync(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  "types", "--config", "wrangler.jsonc",
  "--env-file", "scripts/cloudflare-type-bindings.example",
  "--include-runtime=false", "--strict-vars=false",
  "--env-interface", "CloudflareEnv", "cloudflare-env.d.ts",
], { cwd: root, env, stdio: "inherit", shell: false })
if (result.error) {
  console.error("No se pudo iniciar la generación de tipos de Cloudflare.")
  process.exitCode = 1
} else process.exitCode = result.status ?? 1

// Ejecutar desde la copia aislada vista-local. No usa servicios remotos.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { leerSupabaseLocal } from "./supabase-local.mjs"

if (existsSync(".env.local") || !/^project_id = "vibe"$/m.test(readFileSync("supabase/config.toml", "utf8"))) {
  throw new Error("Usa scripts/preparar-verificacion.mjs vista-local")
}
const local = await leerSupabaseLocal().catch(() => { throw new Error("Arranca el Supabase local de Vibe") })
const env = { ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3070", NEXT_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false",
}
// Si Smart App Control bloquea workerd.exe, la vista arranca sin emular los
// bindings de Cloudflare (ver next.config.mjs) en vez de fallar al cargar.
function workerdBloqueado() {
  if (process.platform !== "win32") return false
  const store = path.resolve("node_modules/.pnpm")
  const dir = readdirSync(store).find(name => name.startsWith("@cloudflare+workerd-windows-64@"))
  if (!dir) return false
  const exe = path.join(store, dir, "node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe")
  return Boolean(spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 15_000 }).error)
}
if (workerdBloqueado()) {
  env.VIBE_DEV_SIN_WORKERD = "1"
  console.warn("Aviso: Windows bloquea workerd.exe; la vista local corre sin bindings de Cloudflare.")
}
// Sin credenciales administrativas ni conexiones a archivos/IA empresariales.
for (const name of Object.keys(env)) {
  if (/^(SUPABASE_TEST_|SUPABASE_SERVICE|R2_|TOGETHER_|META_APP_|CLOUDFLARE_)/.test(name) || name === "NEXT_PUBLIC_R2_PUBLIC_URL") delete env[name]
}
const app = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3070"], { stdio: "inherit", env })
app.once("error", () => { process.exitCode = 1 })
app.once("exit", code => { process.exitCode = code ?? 1 })

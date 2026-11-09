// Actualización forward-only de la vista de desarrollo. No ejecuta pruebas,
// reset, seeds ni operaciones remotas. Cerrar el editor antes de usarla.
import { spawn, execFileSync } from "node:child_process"
import { createWriteStream, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { pipeline } from "node:stream/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const container = "supabase_db_vibe"
const preview = path.join(root, ".wrangler/auditoria/vista-local")
const cli = path.join(root, "node_modules/supabase/dist/supabase.js")
const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8")
if (process.argv.length !== 3 || process.argv[2] !== "--aplicar-local") {
  throw new Error("Uso: node scripts/actualizar-vibe-local.mjs --aplicar-local. Guarda y cierra el editor primero.")
}
if (!/^project_id = "vibe"$/m.test(config) || !/^port = 54421$/m.test(config)) {
  throw new Error("Configuración distinta del Supabase local de Vibe")
}
if (!existsSync(cli) || !existsSync(preview) || existsSync(path.join(preview, ".env.local"))) {
  throw new Error("Falta la copia local aislada o contiene un entorno no permitido")
}
const identity = execFileSync("docker", ["inspect", "--format",
  '{{ index .Config.Labels "com.supabase.cli.project" }}', container], { encoding: "utf8" }).trim()
if (identity !== "vibe") throw new Error("El contenedor no pertenece a Vibe")

const directory = path.join(root, ".wrangler/auditoria", `actualizacion-local-${Date.now()}`)
mkdirSync(path.join(directory, "supabase/migrations"), { recursive: true })
writeFileSync(path.join(directory, "supabase/config.toml"), config)
const migrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort()
for (const name of migrations) {
  cpSync(path.join(root, "supabase/migrations", name), path.join(directory, "supabase/migrations", name))
}
// No heredar credenciales de proveedores ni opciones de conexión PostgreSQL.
const env = { ...process.env }
for (const name of Object.keys(env)) {
  if (/^(SUPABASE_|PG|DATABASE_|R2_|TOGETHER_|CLOUDFLARE_)/i.test(name)) delete env[name]
}
env.SUPABASE_TELEMETRY_DISABLED = "true"

async function run(command, args, { label = "migracion", output: outputPath } = {}) {
  const child = spawn(command, args, { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] })
  // No volcar mensajes SQL ni contenidos de filas al terminal. Conservar el
  // diagnóstico local junto al respaldo si una migración se interrumpe.
  const diagnostic = pipeline(child.stderr, createWriteStream(path.join(directory, `${label}.log`), { flags: "wx" }))
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("Operación local interrumpida; consulta el registro local antes de reintentar")))
  })
  const output = pipeline(child.stdout, createWriteStream(outputPath ?? path.join(directory, "migracion.stdout.log"), { flags: "wx" }))
  try {
    await Promise.all([exit, output, diagnostic])
  } catch (error) {
    child.kill()
    throw error
  }
}

const backup = path.join(directory, "antes-de-migrar.dump")
console.log("Guardando respaldo de la base local de Vibe…")
await run("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom"], {
  label: "respaldo", output: backup,
})
console.log("Aplicando migraciones pendientes sin borrar ni reconstruir datos…")
await run(process.execPath, [cli, "migration", "up", "--local"])
// No actualizar código si alguna migración falla. Las anteriores pueden haber
// quedado aplicadas: conservar respaldo y registro; nunca revertir con reset.
execFileSync(process.execPath, [path.join(root, "scripts/preparar-verificacion.mjs"), "vista-local"], {
  cwd: root, env, stdio: "inherit",
})
writeFileSync(path.join(directory, "actualizacion.json"), JSON.stringify({
  completedAt: new Date().toISOString(), container, migrations, preview,
  backup: path.basename(backup), testsExecuted: false,
}, null, 2))
console.log(`Código local actualizado. Respaldo conservado en ${directory}. No se ejecutaron pruebas ni se comprobó la restauración.`)

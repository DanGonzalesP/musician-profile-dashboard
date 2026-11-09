// Copia verificable sin entornos reales ni sesiones de proveedores.
// Se ejecuta desde el repositorio; nunca copia .env.local ni caches OAuth.
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const copyName = process.argv[2] ?? "proyecto"
if (!["proyecto", "cloudflare", "vista-local"].includes(copyName)) throw new Error("Copia desconocida")
const destination = path.join(root, ".wrangler", "auditoria", copyName)
// La copia vive dentro de un directorio ignorado por el repositorio padre.
// Una raíz Git propia permite que Tailwind respete su .gitignore y no busque
// clases en cachés binarias. No tiene remoto, commits ni credenciales.
mkdirSync(destination, { recursive: true })
if (!existsSync(path.join(destination, ".git"))) {
  execFileSync("git", ["init", "--initial-branch=verificacion-aislada", destination], {
    stdio: "pipe",
  })
}
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean)
const forbidden = /(^|\/)(?:\.git|\.claude|\.codex|\.agents|\.aws|\.wrangler|\.pnpm-store|node_modules|\.next|\.open-next|test-results|playwright-report)(?:\/|$)|(^|\/)\.env(?!\.example$)|^supabase\/(?:\.temp|\.branches)\//
const personalEmail = /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.[A-Za-z]{2,}/gi
let count = 0
for (const relative of files) {
  if (forbidden.test(relative)) continue
  const source = path.resolve(root, relative)
  const target = path.resolve(destination, relative)
  if (!source.startsWith(root + path.sep) || !target.startsWith(destination + path.sep)) {
    throw new Error("Ruta fuera de Vibe")
  }
  if (!existsSync(source)) continue
  if (lstatSync(source).isSymbolicLink()) throw new Error("La copia de verificación no sigue enlaces simbólicos")
  mkdirSync(path.dirname(target), { recursive: true })
  if (/\.(?:[cm]?js|tsx?|md|txt|sql|ya?ml|jsonc?|toml|ps1)$/.test(relative)) {
    writeFileSync(target, readFileSync(source, "utf8").replace(personalEmail, "contacto@example.invalid"))
  } else {
    cpSync(source, target)
  }
  count++
}
console.log(`Copia aislada actualizada: ${count} archivos en ${destination}`)

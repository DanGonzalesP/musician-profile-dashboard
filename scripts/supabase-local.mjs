// Conexión al Supabase local de Vibe (54421) para la vista local y los gates.
//
// Primero pregunta a la CLI (`supabase status -o json`). Si Windows bloquea su
// binario (Smart App Control: "Una directiva de Control de aplicaciones bloqueó
// este archivo"), reconstruye los mismos campos desde los contenedores ya activos
// del proyecto `vibe`: URL de Kong, puerto de Postgres y claves anon/service_role
// firmadas con el secreto JWT del GoTrue local, como hace la CLI. Antes de
// devolverlas comprueba que la API local las acepta. Nunca imprime claves, no
// toca la configuración de seguridad de Windows y sólo admite el proyecto local.
import { createHmac } from "node:crypto"
import { spawnSync } from "node:child_process"
import path from "node:path"

const API_URL = "http://127.0.0.1:54421"

function desdeCli() {
  const cli = path.resolve("node_modules/supabase/dist/supabase.js")
  const status = spawnSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8" })
  if (status.status !== 0) return null
  try { return JSON.parse(status.stdout) } catch { return null }
}

function envDeContenedor(nombre) {
  const result = spawnSync("docker", ["inspect", nombre, "--format", "{{json .Config.Env}}"], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`Contenedor local ${nombre} no disponible`)
  return Object.fromEntries(JSON.parse(result.stdout).map(item => {
    const index = item.indexOf("=")
    return [item.slice(0, index), item.slice(index + 1)]
  }))
}

function puerto(nombre, interno) {
  const result = spawnSync("docker", ["port", nombre, interno], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`Puerto de ${nombre} no disponible`)
  const match = /:(\d+)\s*$/m.exec(result.stdout.trim().split(/\r?\n/)[0] ?? "")
  return match ? Number(match[1]) : null
}

const base64url = value => Buffer.from(value).toString("base64url")
function firmar(role, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = base64url(JSON.stringify({ iss: "supabase-demo", role, exp: 1983812996 }))
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${signature}`
}

async function desdeDocker() {
  if (puerto("supabase_kong_vibe", "8000/tcp") !== 54421) throw new Error("Kong local de Vibe no está en 54421")
  const dbPort = puerto("supabase_db_vibe", "5432/tcp")
  if (dbPort !== 54422) throw new Error("Postgres local de Vibe no está en 54422")
  const secret = envDeContenedor("supabase_auth_vibe").GOTRUE_JWT_SECRET
  if (!secret) throw new Error("GoTrue local sin secreto JWT")
  const local = {
    API_URL,
    ANON_KEY: firmar("anon", secret),
    SERVICE_ROLE_KEY: firmar("service_role", secret),
    DB_URL: `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
  }
  const probe = await fetch(`${API_URL}/auth/v1/settings`, { headers: { apikey: local.ANON_KEY }, signal: AbortSignal.timeout(10_000) })
  const rest = await fetch(`${API_URL}/rest/v1/`, {
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${local.ANON_KEY}` }, signal: AbortSignal.timeout(10_000),
  })
  if (!probe.ok || !rest.ok) throw new Error("La API local rechazó las claves reconstruidas")
  return local
}

export async function leerSupabaseLocal() {
  const local = desdeCli() ?? await desdeDocker()
  if (local.API_URL !== API_URL) throw new Error("Endpoint local inesperado")
  return local
}

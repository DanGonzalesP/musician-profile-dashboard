// Ejecutar después de pnpm cf:build, sólo en la copia aislada sin .env.
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fork } from "node:child_process"
import { once } from "node:events"
import { randomBytes } from "node:crypto"
import { createTestHarness } from "wrangler"
if (!process.env.SMOKE_BUILD_VERSION) throw new Error("Indica SMOKE_BUILD_VERSION igual a APP_VERSION usado al construir")

for (const name of [".env", ".env.local", ".dev.vars"]) {
  if (existsSync(name)) throw new Error("Este smoke requiere una copia sin entornos reales")
}
const rateLimitKey = randomBytes(32).toString("hex")
const server = createTestHarness({ workers: [{ configPath: "wrangler.jsonc", vars: {
  R2_ENDPOINT: "http://127.0.0.1:54998", R2_BUCKET_NAME: "vibe-ficticio",
}, secrets: {
  R2_ACCESS_KEY_ID: "ficticia", R2_SECRET_ACCESS_KEY: "ficticia",
  // Clave efímera de esta corrida: sin ella el límite anónimo falla cerrado (503)
  // y ocultaría el 503 propio de las dependencias que se comprueba abajo.
  ANONYMOUS_RATE_LIMIT_KEY: rateLimitKey, ANONYMOUS_RATE_LIMIT_KEY_ID: "smoke_local",
} }] })
const fixture = fork("tests/e2e/fixtures/servidor-supabase.mjs", ["54999"], { stdio: ["ignore", "ignore", "inherit", "ipc"],
  env: { ...process.env, ANONYMOUS_RATE_LIMIT_KEY: rateLimitKey, ANONYMOUS_RATE_LIMIT_KEY_ID: "smoke_local" } })
async function updateProfile(version, suspended = false) {
  const ack = once(fixture, "message", { signal: AbortSignal.timeout(10000) })
  fixture.send({ type: "smoke-profile", version, suspended })
  assert.equal((await ack)[0].type, "smoke-updated")
}
try {
  assert.equal((await once(fixture, "message", { signal: AbortSignal.timeout(10000) }))[0].type, "ready")
  await server.listen()
  const worker = server.getWorker()
  const env = await worker.getEnv()
  // Mismo esquema que populate-cache de OpenNext 1.20.6, exclusivamente local.
  await env.NEXT_TAG_CACHE_D1.exec("CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER DEFAULT NULL, UNIQUE(tag) ON CONFLICT REPLACE)")
  const schema = await env.NEXT_TAG_CACHE_D1.prepare("PRAGMA table_info(revalidations)").all()
  assert.deepEqual(schema.results.map(row => row.name), ["tag", "revalidatedAt", "stale", "expire"])
  await env.NEXT_INC_CACHE_R2_BUCKET.put("smoke", "cache-local")
  assert.equal(await (await env.NEXT_INC_CACHE_R2_BUCKET.get("smoke")).text(), "cache-local")
  const storage = await worker.getDurableObjectStorage("NEXT_CACHE_DO_QUEUE", { name: "smoke-vibe" })
  await storage.exec("SELECT 1") // Arranca la clase real y comprueba WORKER_SELF_REFERENCE.
  const wasm = readFileSync("public/ffmpeg/ffmpeg-core.wasm")
  await env.VIBE_STATIC_ASSETS.put("ffmpeg-core.wasm", wasm)
  const asset = await worker.fetch("/ffmpeg/ffmpeg-core.wasm")
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get("content-type"), "application/wasm")
  assert.equal(asset.headers.get("cross-origin-resource-policy"), "same-site")
  assert.equal((await asset.arrayBuffer()).byteLength, wasm.length)
  const unchanged = await worker.fetch("/ffmpeg/ffmpeg-core.wasm", { headers: { "If-None-Match": asset.headers.get("etag") } })
  assert.equal(unchanged.status, 304)
  const legal = await worker.fetch("/legal")
  assert.equal(legal.status, 200)
  assert.match(legal.headers.get("content-security-policy"), /nonce-/)
  await updateProfile(1)
  const first = await worker.fetch("/artista_prueba")
  assert.equal(first.status, 200)
  assert.match(await first.text(), /Publicación local 1/)
  assert.match(await (await worker.fetch("/artista_prueba")).text(), /Publicación local 1/)
  assert.ok((await env.NEXT_INC_CACHE_R2_BUCKET.list()).objects.length > 1, "el perfil debe escribir caché real")
  await updateProfile(2)
  assert.match(await (await worker.fetch("/artista_prueba")).text(), /Publicación local 2/)
  await updateProfile(2, true)
  assert.doesNotMatch(await (await worker.fetch("/artista_prueba")).text(), /Publicación local 2/)
  const health = await worker.fetch("/api/health")
  assert.equal(health.status, 503) // R2 S3 ficticio no existe: falla cerrado.
  assert.equal(health.headers.get("retry-after"), null, "el 503 debe ser de dependencias, no del límite anónimo")
  const body = await health.json()
  assert.equal(body.estado, "degradado")
  assert.equal(body.version, process.env.SMOKE_BUILD_VERSION.slice(0, 7))
  assert.equal(body.dependencias.r2, "error")
  assert.equal(body.dependencias.supabase, "ok")
  assert.equal(health.headers.get("cache-control"), "no-store, max-age=0")
  console.log("PASS Worker real: D1, R2, DO, WASM, ETag, CSP, health, versión, caché caliente, publicación y suspensión")
} finally {
  fixture.kill()
  await server.close()
}

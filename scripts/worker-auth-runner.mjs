// Build y E2E con GoTrue/Postgres reales LOCALES y D1/R2/DO de workerd local.

// No lee credenciales de empresa ni despliega. Los objetos de artistas se

// almacenan y verifican en el fixture HTTPS local, separado de la caché R2.

import assert from "node:assert/strict"

import { existsSync, readFileSync, readdirSync } from "node:fs"

import { spawn } from "node:child_process"

import { createTestHarness } from "wrangler"



for (const file of readdirSync(".")) {

  if (/^(\.env($|\.)|\.dev\.vars($|\.))/.test(file) && file !== ".env.example") {

    throw new Error("Usa la copia aislada sin archivos de entorno")

  }

}

assert.equal(process.env.SUPABASE_TEST_URL, "http://127.0.0.1:54421")

const anon = process.env.SUPABASE_TEST_ANON_KEY

const moderator = process.env.SUPABASE_TEST_MODERATOR_JSON
delete process.env.SUPABASE_TEST_MODERATOR_JSON
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

const receiptKey = process.env.VIBE_E2E_RECEIPT_KEY

const anonymousKey = process.env.VIBE_E2E_ANONYMOUS_KEY

assert.ok(/^[0-9a-f]{64}$/.test(anonymousKey ?? ""), "Falta clave anónima efímera")

delete process.env.VIBE_E2E_ANONYMOUS_KEY

const receiptKeyId = process.env.VIBE_E2E_RECEIPT_KEY_ID

assert.ok(anon && service, "Faltan credenciales efímeras del Supabase local")

assert.ok(/^[0-9a-f]{64}$/.test(receiptKey ?? ""), "Falta recibo efímero válido")

assert.ok(/^e2e_[0-9a-f-]{36}$/.test(receiptKeyId ?? ""), "Falta identificador efímero válido")

// Ni el build ni el runtime reciben la clave administrativa del fixture.

delete process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

delete process.env.VIBE_E2E_RECEIPT_KEY

delete process.env.VIBE_E2E_RECEIPT_KEY_ID

const buildEnv = {

  ...process.env,

  NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:54425",

  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,

  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3200",

  NEXT_PUBLIC_R2_PUBLIC_URL: "https://r2-publico-de-prueba.localhost",

  R2_ENDPOINT: "https://127.0.0.1:54998",

  R2_BUCKET_NAME: "vibe-e2e",

  APP_VERSION: "worker-auth-local",

  NEXT_TELEMETRY_DISABLED: "1",

  WRANGLER_SEND_METRICS: "false",

}

async function run(args, env) {

  const child = spawn("pnpm", args, {

    stdio: "inherit", env, shell: process.platform === "win32",

  })

  const code = await new Promise((resolve, reject) => {

    child.once("error", reject)

    child.once("exit", resolve)

  })

  assert.equal(code, 0, `Falló pnpm ${args.join(" ")}`)

}

await run(["cf:build"], buildEnv)

assert.ok(existsSync(".open-next/worker.js"))

const server = createTestHarness({ workers: [{

  configPath: "wrangler.jsonc",

  vars: { R2_ENDPOINT: buildEnv.R2_ENDPOINT, R2_BUCKET_NAME: buildEnv.R2_BUCKET_NAME },

  secrets: { R2_ACCESS_KEY_ID: "clave-de-prueba-sin-valor-real", R2_SECRET_ACCESS_KEY: "secreto-de-prueba-sin-valor-real",

    MEDIA_RECEIPT_KEY: receiptKey, MEDIA_RECEIPT_KEY_ID: receiptKeyId,

    ANONYMOUS_RATE_LIMIT_KEY: anonymousKey, ANONYMOUS_RATE_LIMIT_KEY_ID: receiptKeyId },

}] })

try {

  const { url } = await server.listen()

  const env = await server.getWorker().getEnv()

  await env.NEXT_TAG_CACHE_D1.exec("CREATE TABLE revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER DEFAULT NULL, UNIQUE(tag) ON CONFLICT REPLACE)")

  await env.VIBE_STATIC_ASSETS.put("ffmpeg-core.wasm", readFileSync("public/ffmpeg/ffmpeg-core.wasm"))

  const started = Date.now()

  await run(["exec", "playwright", "test", "--config", "playwright.worker-auth.config.ts", "--max-failures=1"], {

    ...process.env,

    WORKER_AUTH_URL: url.origin,

    SUPABASE_TEST_SERVICE_ROLE_KEY: service,
    ...(moderator ? { SUPABASE_TEST_MODERATOR_JSON: moderator } : {}),

  })

  // Sólo las Server Actions autenticadas de la suite pueden escribir aquí.

  // Comprueba efectos persistidos, no solamente que el perfil se vea nuevo

  // (su clave también varía por versión y podría enmascarar una invalidación rota).

  const tags = await env.NEXT_TAG_CACHE_D1.prepare("SELECT tag, revalidatedAt, expire FROM revalidations WHERE tag LIKE '%perfil:e2e_%'").all()

  assert.ok(tags.results.length >= 2, "Deben invalidarse perfiles de escritorio y móvil en D1")

  for (const row of tags.results) {

    assert.ok(row.revalidatedAt >= started, "La invalidación debe proceder de esta corrida")

    assert.ok(row.expire >= started, "La etiqueta debe expirar inmediatamente al publicar")

  }

  assert.ok((await env.NEXT_INC_CACHE_R2_BUCKET.list()).objects.length > 0, "Los perfiles deben poblar la caché R2 real local")

  console.log(`PASS Worker autenticado: suite completa, WAV real y ${tags.results.length} etiquetas de perfil invalidadas en D1`)

} finally {

  await server.close()

}


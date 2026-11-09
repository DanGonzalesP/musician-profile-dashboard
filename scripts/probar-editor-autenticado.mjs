// TLS y recibos efímeros exclusivos de las pruebas locales de Vibe.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, unlinkSync, rmdirSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { prepararReciboMediaE2E } from "./recibo-media-e2e.mjs"
import { prepararModeradorE2E } from "./moderador-e2e.mjs"

assert.equal(process.env.SUPABASE_TEST_URL, "http://127.0.0.1:54421", "Solo Supabase local de Vibe")
mkdirSync(".wrangler", { recursive: true })
const dir = mkdtempSync(resolve(".wrangler/editor-auth-tls-"))
const cert = join(dir, "cert.pem")
const key = join(dir, "key.pem")
let receipt
let moderator
try {
  // El comando público y CI deben poder preparar la misma sesión de moderación
  // que el lanzador de la copia aislada. Si éste ya la pasó, conserva su dueño
  // y su limpieza; nunca se crea otra cuenta ni se envía al servidor de Next.
  if (!process.env.SUPABASE_TEST_MODERATOR_JSON) {
    moderator = await prepararModeradorE2E({
      API_URL: process.env.SUPABASE_TEST_URL,
      SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    })
  }
  const openssl = process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
    ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl"
  const generated = spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=vibe-e2e-local",
    "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" })
  assert.equal(generated.status, 0, "Se necesita OpenSSL para TLS local")
  receipt = prepararReciboMediaE2E()
  const child = spawn("pnpm", ["exec", "playwright", "test", "--config", "playwright.auth.config.ts", ...process.argv.slice(2)], {
    shell: process.platform === "win32", stdio: "inherit", env: { ...process.env,
      NODE_EXTRA_CA_CERTS: cert, R2_FIXTURE_TLS_CERT: cert, R2_FIXTURE_TLS_KEY: key,
      MEDIA_RECEIPT_KEY: receipt.key, MEDIA_RECEIPT_KEY_ID: receipt.keyId,
      ANONYMOUS_RATE_LIMIT_KEY: receipt.anonymousKey, ANONYMOUS_RATE_LIMIT_KEY_ID: receipt.keyId,
      ...(moderator ? { SUPABASE_TEST_MODERATOR_JSON: JSON.stringify(moderator.user) } : {}),
    },
  })
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)) })
} finally {
  try { receipt?.cleanup() } finally {
    try { await moderator?.cleanup() } finally {
      for (const file of [cert, key]) if (existsSync(file)) unlinkSync(file)
      rmdirSync(dir)
    }
  }
}

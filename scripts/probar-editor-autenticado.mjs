// TLS y recibos efímeros exclusivos de las pruebas locales de Vibe.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, unlinkSync, rmdirSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { prepararReciboMediaE2E } from "./recibo-media-e2e.mjs"

assert.equal(process.env.SUPABASE_TEST_URL, "http://127.0.0.1:54421", "Solo Supabase local de Vibe")
mkdirSync(".wrangler", { recursive: true })
const dir = mkdtempSync(resolve(".wrangler/editor-auth-tls-"))
const cert = join(dir, "cert.pem")
const key = join(dir, "key.pem")
let receipt
try {
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
    },
  })
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)) })
} finally {
  receipt?.cleanup()
  for (const file of [cert, key]) if (existsSync(file)) unlinkSync(file)
  rmdirSync(dir)
}

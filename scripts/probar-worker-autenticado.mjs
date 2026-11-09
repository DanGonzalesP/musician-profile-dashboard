// HTTPS efímero para Supabase local: la CSP de producción rechaza HTTP.
// No modificar CSP ni desactivar la validación TLS global para hacer pasar tests.
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { createServer } from "node:tls"
import { connect } from "node:net"
import { spawn, spawnSync } from "node:child_process"
import { prepararReciboMediaE2E } from "./recibo-media-e2e.mjs"
import { createR2FixtureServer } from "../tests/e2e-auth/fixtures/servidor-r2.mjs"

assert.equal(process.env.SUPABASE_TEST_URL, "http://127.0.0.1:54421")
mkdirSync(".wrangler", { recursive: true })
const dir = mkdtempSync(resolve(".wrangler/worker-auth-tls-"))
const cert = join(dir, "cert.pem")
const key = join(dir, "key.pem")
const sockets = new Set()
let proxy
let storage
let receipt
try {
  const openssl = process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
    ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl"
  const generated = spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048",
    "-nodes", "-keyout", key, "-out", cert, "-days", "1",
    "-subj", "/CN=vibe-local-test", "-addext", "subjectAltName=IP:127.0.0.1",
  ], { stdio: "ignore" })
  assert.equal(generated.status, 0, "Se necesita OpenSSL; ejecutar en Linux/CI o el contenedor exclusivo de Vibe")
  proxy = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, socket => {
    const upstream = connect(54421, "127.0.0.1")
    sockets.add(socket); sockets.add(upstream)
    socket.on("error", () => upstream.destroy()); upstream.on("error", () => socket.destroy())
    socket.on("close", () => { sockets.delete(socket); upstream.destroy() })
    upstream.on("close", () => { sockets.delete(upstream); socket.destroy() })
    socket.pipe(upstream).pipe(socket)
  })
  proxy.on("tlsClientError", () => {})
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(54425, "127.0.0.1", resolve) })
  receipt = prepararReciboMediaE2E()
  storage = createR2FixtureServer({ tls: { key: readFileSync(key), cert: readFileSync(cert) } })
  await new Promise((resolve, reject) => { storage.once("error", reject); storage.listen(54998, "127.0.0.1", resolve) })
  const child = spawn(process.execPath, ["scripts/worker-auth-runner.mjs"], {
    stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: cert,
      VIBE_E2E_RECEIPT_KEY: receipt.key, VIBE_E2E_RECEIPT_KEY_ID: receipt.keyId, VIBE_E2E_ANONYMOUS_KEY: receipt.anonymousKey },
  })
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve) })
  process.exitCode = code ?? 1
} finally {
  for (const socket of sockets) socket.destroy()
  if (proxy?.listening) await new Promise(resolve => proxy.close(resolve))
  if (storage?.listening) {
    storage.closeAllConnections()
    await new Promise(resolve => storage.close(resolve))
  }
  receipt?.cleanup()
  // Sólo los dos archivos recién creados, nunca borrado recursivo.
  for (const file of [cert, key]) { try { unlinkSync(file) } catch (error) { if (error.code !== "ENOENT") throw error } }
  rmdirSync(dir)
}

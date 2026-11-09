// Receptor exclusivo del contenedor Vibe. Claves LOCALES por stdin, no disco/log.
// El túnel conserva localhost para los guardas de tests y apunta sólo al puerto
// 54421 del host; exigirBaseDeVibe comprueba además las tablas antes de sembrar.
import { createServer, connect } from "node:net"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
const gate = process.argv[2]
if (!["test:db", "test:e2e:auth", "test:visual:auth", "cf:test:auth"].includes(gate) || existsSync(".env.local")) throw new Error("Entorno no permitido")
let input = ""
for await (const chunk of process.stdin) input += chunk
const local = JSON.parse(input)
input = ""
if (local.url !== "http://127.0.0.1:54421") throw new Error("Endpoint inesperado")
const connections = new Set()
const proxy = createServer(socket => {
  const upstream = connect(54421, "host.docker.internal")
  connections.add(socket); connections.add(upstream)
  socket.on("error", () => upstream.destroy()); upstream.on("error", () => socket.destroy())
  socket.on("close", () => { connections.delete(socket); upstream.destroy() })
  upstream.on("close", () => { connections.delete(upstream); socket.destroy() })
  socket.pipe(upstream).pipe(socket)
})
await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(54421, "127.0.0.1", resolve) })
const processTest = spawn("pnpm", [gate], { stdio: "inherit", env: { ...process.env,
  NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false",
  SUPABASE_TEST_URL: local.url, SUPABASE_TEST_ANON_KEY: local.anon, SUPABASE_TEST_SERVICE_ROLE_KEY: local.service,
  ...(local.moderator ? { SUPABASE_TEST_MODERATOR_JSON: JSON.stringify(local.moderator) } : {}),
  ...(local.receiptKey ? { VIBE_E2E_RECEIPT_KEY: local.receiptKey, VIBE_E2E_RECEIPT_KEY_ID: local.receiptKeyId, VIBE_E2E_ANONYMOUS_KEY: local.anonymousKey } : {}),
} })
const code = await new Promise(resolve => { processTest.once("exit", resolve); processTest.once("error", () => resolve(1)) })
for (const socket of connections) socket.destroy()
await new Promise(resolve => proxy.close(resolve))
process.exit(code ?? 1)

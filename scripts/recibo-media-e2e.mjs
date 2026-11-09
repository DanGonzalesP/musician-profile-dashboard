// Material efímero de pruebas. Ninguna clave de empresa ni service role en app.
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"

export function prepararReciboMediaE2E({ allowInherited = true } = {}) {
  assert.equal(process.env.SUPABASE_TEST_URL, "http://127.0.0.1:54421", "Solo Vibe local")
  if (allowInherited && process.env.VIBE_E2E_RECEIPT_KEY) {
    const key = process.env.VIBE_E2E_RECEIPT_KEY
    const keyId = process.env.VIBE_E2E_RECEIPT_KEY_ID
    assert.ok(/^[0-9a-f]{64}$/.test(key), "Recibo efímero inválido")
    assert.ok(/^e2e_[0-9a-f-]{36}$/.test(keyId ?? ""), "Identificador efímero inválido")
    // El lanzador host lo provisionó por stdin; él es responsable de retirarlo.
    const anonymousKey = process.env.VIBE_E2E_ANONYMOUS_KEY
    assert.ok(/^[0-9a-f]{64}$/.test(anonymousKey ?? ""), "Falta clave anónima efímera")
    return { key, keyId, anonymousKey, cleanup() {} }
  }
  const identity = execFileSync("docker", ["inspect", "--format",
    '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8" }).trim()
  assert.equal(identity, "vibe")
  const keyId = `e2e_${randomUUID()}`
  const key = randomBytes(32).toString("hex")
  const anonymousKey = randomBytes(32).toString("hex")
  const sql = input => {
    const result = spawnSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-q"], { input, stdio: ["pipe", "pipe", "pipe"] })
    assert.equal(result.status, 0, "No se pudo provisionar/retirar el recibo efímero")
  }
  sql(`begin; insert into private.media_runtime_keys(key_id,secret_hex) values('${keyId}','${key}'); insert into private.anonymous_gateway_keys values('${keyId}','${anonymousKey}'); commit;`)
  return { key, keyId, anonymousKey, cleanup() { sql(`begin; delete from private.media_runtime_keys where key_id='${keyId}'; delete from private.anonymous_gateway_keys where key_id='${keyId}'; commit;`) } }
}

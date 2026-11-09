import { afterAll, afterEach, beforeAll, expect, it } from "vitest"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import type { SupabaseClient } from "@supabase/supabase-js"
import { claveDeMedio, clienteAnonimo, crearUsuario, limpiarUsuarios, prepararMedioHistorico, type UsuarioDePrueba } from "./helpers"
import { signMediaReceipt, type MediaReceipt } from "../../lib/media-receipt"

const users: UsuarioDePrueba[] = []
const keyId = `maintenance_${randomUUID()}`
const secret = randomBytes(32).toString("hex")
const runtimeKeyId = `maintenance_runtime_${randomUUID()}`
const runtimeSecret = randomBytes(32).toString("hex")
let provisioned = false

function sql(input: string): string {
  try {
    return execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
      { input, encoding: "utf8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch { throw new Error("Falló el fixture SQL local de mantenimiento") }
}
beforeAll(() => {
  const project = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8", timeout: 15000 }).trim()
  if (project !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Sólo Vibe local")
  sql(`insert into private.media_maintenance_keys(key_id,secret_hex) values('${keyId}','${secret}');
    insert into private.media_runtime_keys(key_id,secret_hex) values('${runtimeKeyId}','${runtimeSecret}');`)
  provisioned = true
})
afterEach(async () => {
  for (const u of users) sql(`delete from private.media_maintenance_leases where owner_user_id='${u.id}';`)
  await limpiarUsuarios(...users)
  users.splice(0, users.length)
})
afterAll(() => {
  if (provisioned) sql(`delete from private.media_runtime_keys where key_id='${runtimeKeyId}'; delete from private.media_maintenance_keys where key_id='${keyId}'; delete from private.media_maintenance_nonces where key_id='${keyId}';`)
})
async function user() { const u = await crearUsuario(); users.push(u); return u }
function signed(action: "claim" | "retire" | "finish", extra: Record<string, unknown> = {}, issuedAt = Math.floor(Date.now() / 1000)) {
  const p_payload = JSON.stringify({ version: 1, keyId, action, nonce: randomUUID(), issuedAt, ...extra })
  return { p_payload, p_signature: createHmac("sha256", Buffer.from(secret, "hex")).update(p_payload).digest("hex") }
}
const run = (client: SupabaseClient, proof = signed("claim")) => client.rpc("run_media_maintenance", proof)
function reservation(owner: UsuarioDePrueba, bytes = 120): MediaReceipt {
  return { action: "reserve", actor: owner.id, key: claveDeMedio(owner), bytes,
    contentType: "image/webp", profileId: owner.profileId, limitBytes: 1000, quotaMode: "rechazar" }
}
async function reserve(owner: UsuarioDePrueba, receipt = reservation(owner)) {
  return { receipt, result: await owner.supabase.rpc("reserve_media_upload", signMediaReceipt(receipt, runtimeSecret, runtimeKeyId)) }
}
function state(owner: UsuarioDePrueba) {
  return sql(`select state from private.media_account_state where owner_user_id='${owner.id}';`)
}

it("verifica firma, vigencia y antirreplay; la RPC sólo admite anon y no la sesión autenticada", async () => {
  const owner = await user()
  const proof = signed("claim")
  expect((await run(clienteAnonimo(), { ...proof, p_signature: "0".repeat(64) })).error).toBeTruthy()
  const expired = signed("claim", {}, Math.floor(Date.now() / 1000) - 120)
  expect((await run(clienteAnonimo(), expired)).error).toBeTruthy()
  expect((await run(owner.supabase)).error).toBeTruthy()
  expect((await run(clienteAnonimo(), proof)).error).toBeNull()
  expect((await run(clienteAnonimo(), proof)).error).toBeTruthy()
})

it("reclama trabajos distintos en llamadas concurrentes y expira leases para reanudar", async () => {
  const a = await user(), b = await user()
  expect((await a.supabase.rpc("begin_media_account_closure")).data).toBe(true)
  expect((await b.supabase.rpc("begin_media_account_closure")).data).toBe(true)
  const claims = await Promise.all([run(clienteAnonimo()), run(clienteAnonimo())])
  const jobs = claims.map(x => x.data?.job).filter(Boolean)
  expect(jobs).toHaveLength(2)
  expect(jobs[0].owner).not.toBe(jobs[1].owner)
  const first = jobs.find(j => j.owner === a.id) ?? jobs[0]
  const owner = users.find(u => u.id === first.owner)!
  sql(`update private.media_maintenance_leases set lease_until=clock_timestamp()-interval '1 second' where owner_user_id='${owner.id}';`)
  const resumed = await run(clienteAnonimo())
  expect(resumed.data?.job?.owner).toBe(owner.id)
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: first.leaseId }))).error?.code).toBe("PT409")
})

it("completa mediante anon un cierre vacío previamente autorizado por JWT; otro usuario sigue vivo", async () => {
  const owner = await user(), other = await user()
  expect((await owner.supabase.rpc("begin_media_account_closure")).data).toBe(true)
  const job = (await run(clienteAnonimo())).data?.job
  expect(job?.owner).toBe(owner.id)
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: job.leaseId }))).error).toBeNull()
  expect((await owner.supabase.rpc("media_account_exists")).data).toBe(false)
  expect((await other.supabase.rpc("media_account_exists")).data).toBe(true)
  expect(state(other)).toBe("active")
})

it("bloquea el cierre histórico sin drenaje acreditado", async () => {
  const owner = await user()
  const historicKey = claveDeMedio(owner)
  await prepararMedioHistorico({ key: historicKey, owner_user_id: owner.id, folder: "images", bytes: 0 })
  await owner.supabase.rpc("begin_media_account_closure")
  expect((await run(clienteAnonimo())).data?.blocked).toBe(true)
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error?.code).toBe("PT409")
})

it("reclama reservas vencidas, conserva cuota hasta retiro y jamás barre ready o no vencidas", async () => {
  const owner = await user()
  const pending = await reserve(owner, reservation(owner, 800))
  const current = await reserve(owner, reservation(owner, 100))
  expect(pending.result.error).toBeNull(); expect(current.result.error).toBeNull()
  const ready = await reserve(owner, reservation(owner, 100))
  const finalized = await owner.supabase.rpc("finalize_media_upload", signMediaReceipt({ ...ready.receipt, action: "finalize", etag: '"uploaded"' }, runtimeSecret, runtimeKeyId))
  expect(finalized.error).toBeNull()
  sql(`update private.media_upload_intents set expires_at=clock_timestamp()-interval '1 minute' where key='${pending.receipt.key}';`)
  const claimed = (await run(clienteAnonimo())).data?.job
  expect(claimed?.owner).toBe(owner.id)
  expect(claimed?.keys).toContain(pending.receipt.key)
  expect(claimed?.keys).not.toContain(current.receipt.key)
  expect(claimed?.keys).not.toContain(ready.receipt.key)
  expect((await owner.supabase.rpc("reserve_media_upload", signMediaReceipt(reservation(owner), runtimeSecret, runtimeKeyId))).error?.code).toBe("PT413")
  expect((await run(clienteAnonimo(), signed("retire", { leaseId: claimed.leaseId, key: pending.receipt.key, bytes: 1, etag: '"bad"' }))).error?.code).toBe("PT409")
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: claimed.leaseId }))).error?.code).toBe("PT409")
  expect((await run(clienteAnonimo(), signed("retire", { leaseId: claimed.leaseId, key: pending.receipt.key, bytes: 0, etag: '"verified-empty"' }))).error).toBeNull()
  expect((await owner.supabase.rpc("reserve_media_upload", signMediaReceipt(reservation(owner, 200), runtimeSecret, runtimeKeyId))).error).toBeNull()
})

it("reparte 21 claves en tandas de 20 y una tras completar el primer lease", async () => {
  const owner = await user()
  const receipts: MediaReceipt[] = []
  for (let i = 0; i < 21; i++) {
    const r = await reserve(owner, reservation(owner, 20))
    expect(r.result.error).toBeNull()
    receipts.push(r.receipt)
    sql(`update private.media_upload_intents set expires_at=clock_timestamp()-interval '1 minute' where key='${r.receipt.key}';`)
  }
  const first = (await run(clienteAnonimo())).data?.job
  expect(first?.keys).toHaveLength(20)
  expect(new Set(first?.keys).size).toBe(20)
  expect(first?.keys.every((key: string) => receipts.some(r => r.key === key))).toBe(true)
  const retire = (key: string) => run(clienteAnonimo(), signed("retire", { leaseId: first.leaseId, key, bytes: 0, etag: '"verified-empty"' }))
  for (const key of first.keys) expect((await retire(key)).error).toBeNull()
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: first.leaseId }))).error).toBeNull()
  sql(`update private.media_maintenance_leases set next_attempt_at=clock_timestamp()-interval '1 second' where owner_user_id='${owner.id}';`)
  const second = (await run(clienteAnonimo())).data?.job
  expect(second?.keys).toHaveLength(1)
  expect(first.keys).not.toContain(second?.keys[0])
})

it("acepta recibo de retiro sólo para clave reclamada y conserva progreso parcial", async () => {
  const owner = await user()
  const a = await reserve(owner, reservation(owner, 20))
  const b = await reserve(owner, reservation(owner, 20))
  for (const r of [a, b]) sql(`update private.media_upload_intents set expires_at=clock_timestamp()-interval '1 minute' where key='${r.receipt.key}';`)
  const job = (await run(clienteAnonimo())).data?.job
  expect(job?.keys).toHaveLength(2)
  const wrong = await run(clienteAnonimo(), signed("retire", { leaseId: job.leaseId, key: claveDeMedio(owner), bytes: 0, etag: '"verified-empty"' }))
  expect(wrong.error?.code).toBe("PT409")
  const retirement = (key: string) => run(clienteAnonimo(), signed("retire", { leaseId: job.leaseId, key, bytes: 0, etag: '"verified-empty"' }))
  expect((await retirement(job.keys[0])).error).toBeNull()
  expect(sql(`select bytes::text from public.media_assets where key='${job.keys[0]}';`)).toBe("0")
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: job.leaseId }))).error?.code).toBe("PT409")
  expect((await retirement(job.keys[1])).error).toBeNull()
  expect((await run(clienteAnonimo(), signed("finish", { leaseId: job.leaseId }))).error).toBeNull()
})

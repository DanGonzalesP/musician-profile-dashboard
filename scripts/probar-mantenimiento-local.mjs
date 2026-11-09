// Worker scheduled real + Supabase local + binding R2 local. No despliega.
import assert from "node:assert/strict"
import { randomBytes, randomUUID, createHmac } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { createClient } from "@supabase/supabase-js"
import { createTestHarness } from "wrangler"
import { leerSupabaseLocal } from "./supabase-local.mjs"

for (const file of readdirSync(".")) {
  if (/^(\.env($|\.)|\.dev\.vars($|\.))/.test(file) && file !== ".env.example") throw new Error("Usa una copia sin entornos reales")
}
assert.match(readFileSync("supabase/config.toml", "utf8"), /^project_id = "vibe"$/m)
assert.equal(execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8", timeout: 15000 }).trim(), "vibe")
const local = await leerSupabaseLocal()
assert.equal(local.API_URL, "http://127.0.0.1:54421")
const sql = input => {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input, encoding: "utf8", timeout: 15000 })
  assert.equal(result.status, 0, "Falló SQL del fixture local de mantenimiento")
  return result.stdout.trim()
}
// No procesar trabajo ajeno a esta prueba, aunque sea otro fixture local.
assert.equal(sql(`select count(*) from private.media_account_state s join auth.users u on u.id=s.owner_user_id
  where s.state='closing' or exists(select 1 from private.media_upload_intents i where i.owner_user_id=s.owner_user_id and i.state='pending' and i.expires_at<clock_timestamp());`), "0", "Hay trabajo local previo: no procesarlo como fixture propio")
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
assert.equal((await admin.from("profiles").select("id,username,content_version,is_suspended").limit(1)).error, null)
// El runtime sólo recibe anon + clave de mantenimiento, nunca esta clave de fixture.
delete local.SERVICE_ROLE_KEY
const keyId = `maintenance_e2e_${randomUUID()}`
const receiptSecret = randomBytes(32).toString("hex")
const maintenanceSecret = randomBytes(32).toString("hex")
const users = []
let server
let runError
let failRetire = true
let rpcCalls = 0
const rpcSteps = [] // Sólo etapa y estado HTTP: nunca cuerpo, firma o claves.
const proxy = createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/rest/v1/rpc/run_media_maintenance") { res.writeHead(404).end(); return }
    let text = ""
    for await (const chunk of req) { text += chunk; if (text.length > 8192) throw new Error("Payload grande") }
    const payload = JSON.parse(JSON.parse(text).p_payload)
    rpcCalls++
    // Inyección de fallo de transporte: R2 ya recibió el marcador, DB aún no.
    if (failRetire && payload.action === "retire") { rpcSteps.push({ action: "retire", status: 503 }); res.writeHead(503).end("Temporal"); return }
    const response = await fetch(`${local.API_URL}${req.url}`, { method: "POST", redirect: "error",
      headers: { apikey: local.ANON_KEY, authorization: `Bearer ${local.ANON_KEY}`, "content-type": "application/json" }, body: text })
    rpcSteps.push({ action: ["claim", "retire", "finish"].includes(payload.action) ? payload.action : "invalid", status: response.status })
    res.writeHead(response.status, { "content-type": "application/json" }).end(await response.text())
  } catch { res.writeHead(500).end("Fixture fallido") }
})
const signReceipt = data => {
  const p_payload = JSON.stringify({ ...data, version: 1, keyId, issuedAt: Math.floor(Date.now() / 1000) })
  return { p_payload, p_signature: createHmac("sha256", Buffer.from(receiptSecret, "hex")).update(p_payload).digest("hex") }
}
async function user() {
  const email = `maintenance_${randomUUID()}@example.invalid`, password = `Local-${randomUUID()}!`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { vibe_legal: { terms_version: "2026-11-09", privacy_version: "2026-11-09", age_assurance: "adult_self_declared" } } })
  assert.equal(created.error, null)
  const client = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await client.auth.signInWithPassword({ email, password })
  assert.equal(signed.error, null)
  const owner = { id: created.data.user.id, client }
  users.push(owner)
  return owner
}
async function reserve(owner) {
  const receipt = { action: "reserve", actor: owner.id, key: `audio/${owner.id}/${randomUUID()}.mp3`, bytes: 100,
    contentType: "audio/mpeg", limitBytes: 100000, quotaMode: "rechazar" }
  assert.equal((await owner.client.rpc("reserve_media_upload", signReceipt(receipt))).error, null)
  return receipt
}
try {
  sql(`insert into private.media_runtime_keys(key_id,secret_hex) values('${keyId}','${receiptSecret}');
    insert into private.media_maintenance_keys(key_id,secret_hex) values('${keyId}','${maintenanceSecret}');`)
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve))
  server = createTestHarness({ workers: [{ configPath: "wrangler.media-maintenance.jsonc", vars: {
    ENABLE_MEDIA_MAINTENANCE: "true", SUPABASE_URL: `http://127.0.0.1:${proxy.address().port}`,
    SUPABASE_ANON_KEY: local.ANON_KEY, MEDIA_MAINTENANCE_KEY_ID: keyId,
  }, secrets: { MEDIA_MAINTENANCE_KEY: maintenanceSecret } }] })
  await server.listen()
  const worker = server.getWorker()
  const env = await worker.getEnv()
  for (const name of ["ENABLE_MEDIA_MAINTENANCE", "SUPABASE_URL", "SUPABASE_ANON_KEY", "MEDIA_MAINTENANCE_KEY_ID", "MEDIA_MAINTENANCE_KEY"]) {
    const expected = { ENABLE_MEDIA_MAINTENANCE: "true", SUPABASE_URL: `http://127.0.0.1:${proxy.address().port}`, SUPABASE_ANON_KEY: local.ANON_KEY, MEDIA_MAINTENANCE_KEY_ID: keyId, MEDIA_MAINTENANCE_KEY: maintenanceSecret }[name]
    assert.ok(env[name] === expected, `Binding de prueba incorrecto: ${name}`)
  }
  assert.equal((await worker.fetch("/" )).status, 404)
  const tick = () => worker.scheduled({ cron: "*/5 * * * *", scheduledTime: new Date() })

  const active = await user()
  const expired = await reserve(active), ready = await reserve(active), pending = await reserve(active)
  const uploaded = await env.VIBE_MEDIA.put(ready.key, new Uint8Array(100))
  assert.equal((await active.client.rpc("finalize_media_upload", signReceipt({ ...ready, action: "finalize", etag: uploaded.etag }))).error, null)
  sql(`update private.media_upload_intents set expires_at=clock_timestamp()-interval '1 second' where key='${expired.key}';`)
  const failed = await tick()
  assert.notEqual(failed.outcome, "ok", "Debe fallar cuando falta confirmar DB")
  const marker = await env.VIBE_MEDIA.head(expired.key)
  assert.ok(marker, `El fallo debe ocurrir después de escribir R2: outcome=${failed.outcome}, llamadas=${rpcCalls}, RPC=${JSON.stringify(rpcSteps)}`)
  assert.equal(marker.size, 0)
  assert.equal(sql(`select state from private.media_upload_intents where key='${expired.key}';`), "pending")
  assert.equal((await active.client.rpc("uso_de_almacenamiento_bytes")).data, 300)
  console.log("PASS fallo parcial real: marcador R2 conservado y cuota sin liberar")

  failRetire = false
  sql(`update private.media_maintenance_leases set lease_until=clock_timestamp()-interval '1 second' where owner_user_id='${active.id}';`)
  assert.equal((await tick()).outcome, "ok")
  assert.equal(sql(`select state from private.media_upload_intents where key='${expired.key}';`), "retired")
  assert.equal((await active.client.rpc("uso_de_almacenamiento_bytes")).data, 200)
  assert.equal((await env.VIBE_MEDIA.head(ready.key)).size, 100)
  assert.equal(sql(`select state from private.media_upload_intents where key='${pending.key}';`), "pending")
  assert.equal(await env.VIBE_MEDIA.put(expired.key, new Uint8Array(100), { onlyIf: { etagDoesNotMatch: "*" } }), null)
  console.log("PASS recuperación de reserva sin objeto: libera cuota después de confirmar; ready y reserva vigente intactos; PUT tardío rechazado")

  const closing = await user()
  const closingAssets = []
  for (let n = 0; n < 21; n++) closingAssets.push(await reserve(closing))
  await env.VIBE_MEDIA.put(closingAssets[0].key, new Uint8Array(100))
  assert.equal((await closing.client.rpc("begin_media_account_closure")).error, null)
  assert.equal((await closing.client.auth.signOut()).error, null)
  rpcCalls = 0
  assert.equal((await tick()).outcome, "ok")
  assert.equal(rpcCalls, 22) // claim + veinte confirmaciones + finish; más veinte PUT = 42.
  assert.equal(sql(`select count(*) from auth.users where id='${closing.id}';`), "1")
  assert.equal(sql(`select count(*) from private.media_upload_intents where owner_user_id='${closing.id}' and state='retired';`), "20")
  sql(`update private.media_maintenance_leases set next_attempt_at=clock_timestamp()-interval '1 second' where owner_user_id='${closing.id}';`)
  assert.equal((await tick()).outcome, "ok")
  assert.equal(sql(`select count(*) from auth.users where id='${closing.id}';`), "0")
  assert.equal(sql(`select count(*) from public.media_assets where owner_user_id='${closing.id}' and bytes=0;`), "21")
  for (const asset of closingAssets) assert.equal((await env.VIBE_MEDIA.head(asset.key)).size, 0)
  assert.equal(sql(`select count(*) from auth.users where id='${active.id}';`), "1")
  assert.equal((await env.VIBE_MEDIA.head(ready.key)).size, 100)
  console.log("PASS cierre real sin sesión en dos tandas: 21 marcadores, identidad eliminada, propiedad conservada y otra cuenta intacta")
} catch (error) {
  runError = error
  throw error
} finally {
  await server?.close()
  proxy.closeAllConnections()
  await new Promise(resolve => proxy.close(resolve))
  try {
  for (const owner of users) {
    await admin.from("media_assets").delete().eq("owner_user_id", owner.id)
    await admin.from("profiles").delete().or(`user_id.eq.${owner.id},owner_user_id.eq.${owner.id}`)
    await admin.auth.admin.deleteUser(owner.id)
    sql(`delete from private.media_maintenance_leases where owner_user_id='${owner.id}';`)
  }
  sql(`delete from private.media_runtime_keys where key_id='${keyId}';
    delete from private.media_maintenance_keys where key_id='${keyId}';
    delete from private.media_maintenance_nonces where key_id='${keyId}';`)
  } catch (error) {
    if (!runError) throw error
    console.error("Limpieza de fixtures pendiente: la base local no responde. No se oculta el fallo original.")
  }
}

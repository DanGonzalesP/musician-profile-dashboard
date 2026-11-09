import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { clienteAnonimo } from "./helpers"
import { signAnonymousLimit } from "../../lib/anonymous-rate-limit"

describe("límite anónimo firmado en Postgres", () => {
  const secret = randomBytes(32).toString("hex")
  const keyId = `test_${randomUUID()}`
  const subjects: string[] = []
  let provisioned = false
  function sql(input: string) {
    try {
      execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input, stdio: ["pipe", "pipe", "pipe"] })
    } catch { throw new Error("No se pudo preparar el contador efímero") }
  }
  function proof() {
    const value = signAnonymousLimit("oembed", randomUUID(), secret, keyId)
    subjects.push(JSON.parse(value.p_payload).subject)
    return value
  }
  const consume = (value: ReturnType<typeof proof>) => clienteAnonimo().rpc("consume_anonymous_rate_limit", value)
  beforeAll(() => {
    const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8" }).trim()
    if (label !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Solo Vibe local")
    sql(`insert into private.anonymous_gateway_keys values('${keyId}','${secret}');`)
    provisioned = true
  })
  afterAll(() => {
    if (!provisioned) return
    sql(`delete from private.anonymous_gateway_keys where key_id='${keyId}';`)
    if (subjects.length) sql(`delete from private.anonymous_rate_windows where subject in (${subjects.map(s => `'${s}'`).join(",")});`)
  })
  it("35 peticiones concurrentes consumen un solo cupo de 30", async () => {
    const value = proof()
    const results = await Promise.all(Array.from({ length: 35 }, () => consume(value)))
    expect(results.every(r => !r.error)).toBe(true)
    expect(results.filter(r => r.data?.is_allowed)).toHaveLength(30)
    expect(results.filter(r => !r.data?.is_allowed)).toHaveLength(5)
    expect(results.filter(r => !r.data?.is_allowed).every(r => r.data.retry_after > 0)).toBe(true)
  })
  it("reutilizar un comprobante consume otra petición, no renueva el cupo", async () => {
    const value = proof()
    expect((await consume(value)).data?.remaining).toBe(29)
    expect((await consume(value)).data?.remaining).toBe(28)
  })
  it("rechaza cambiar sujeto o propósito sin una firma nueva", async () => {
    const value = proof()
    const payload = JSON.parse(value.p_payload)
    for (const patch of [{ subject: "0".repeat(64) }, { bucket: "health" }]) {
      const result = await consume({ ...value, p_payload: JSON.stringify({ ...payload, ...patch }) })
      expect(result.error?.code).toBe("42501")
    }
  })
  it("rechaza comprobantes vencidos aun con firma válida", async () => {
    const value = proof()
    const payload = JSON.parse(value.p_payload); payload.issuedAt -= 120
    const p_payload = JSON.stringify(payload)
    const p_signature = createHmac("sha256", Buffer.from(secret, "hex")).update("vibe-anonymous-rate-limit\n" + p_payload).digest("hex")
    expect((await consume({ p_payload, p_signature })).error?.code).toBe("42501")
  })
  it("reinicia sólo la ventana vencida", async () => {
    const value = proof()
    await consume(value)
    sql(`update private.anonymous_rate_windows set started_at=now()-interval '61 seconds',request_count=30 where subject='${JSON.parse(value.p_payload).subject}';`)
    expect((await consume(value)).data).toEqual({ is_allowed: true, remaining: 29, retry_after: 0 })
  })
  it("la anon key no permite consultar secretos ni modificar contadores", async () => {
    const client = clienteAnonimo().schema("private")
    expect((await client.from("anonymous_gateway_keys").select("*")).error).toBeTruthy()
    expect((await client.from("anonymous_rate_windows").delete().eq("bucket", "oembed")).error).toBeTruthy()
  })
  it("revocar la clave invalida el comprobante inmediatamente", async () => {
    const value = proof()
    sql(`delete from private.anonymous_gateway_keys where key_id='${keyId}';`)
    expect((await consume(value)).error).toBeTruthy()
  })
})

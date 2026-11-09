import { afterEach, expect, it, vi } from "vitest"
import { runMediaMaintenance, type MaintenanceEnv } from "./media-maintenance"

const owner = "11111111-1111-4111-8111-111111111111"
const leaseId = "22222222-2222-4222-8222-222222222222"
const env = (put: NonNullable<MaintenanceEnv["VIBE_MEDIA"]>["put"]): MaintenanceEnv => ({
  ENABLE_MEDIA_MAINTENANCE: "true", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-test",
  MEDIA_MAINTENANCE_KEY: "11".repeat(32), MEDIA_MAINTENANCE_KEY_ID: "rotation-1", VIBE_MEDIA: { put },
})
const response = (value: unknown, ok = true) => new Response(JSON.stringify(value), { status: ok ? 200 : 500 })
const job = { leaseId, owner, keys: [`images/${owner}/image.webp`] }
const unpack = (init: RequestInit) => JSON.parse(JSON.parse(String(init.body)).p_payload)

afterEach(() => vi.unstubAllGlobals())

it.each([301, 302, 303, 307, 308])("rechaza redirección %s sin reenviar credenciales ni tocar R2", async (status) => {
  const put = vi.fn()
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.redirect).toBe("manual")
    return new Response(null, { status, headers: { location: "https://otro.example.invalid" } })
  })
  await expect(runMediaMaintenance(env(put), fetcher)).rejects.toThrow("Media maintenance failed")
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(put).not.toHaveBeenCalled()
})

it("falla cerrada si falta configuración, sin llamar RPC ni R2", async () => {
  const fetcher = vi.fn()
  const put = vi.fn()
  await expect(runMediaMaintenance({ ENABLE_MEDIA_MAINTENANCE: "false" }, fetcher)).resolves.toBeUndefined()
  await expect(runMediaMaintenance({ ENABLE_MEDIA_MAINTENANCE: "true" }, fetcher)).rejects.toThrow("not configured")
  expect(fetcher).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

it("valida todo el lote y namespace canónico antes de tocar R2", async () => {
  const put = vi.fn()
  const fetcher = vi.fn().mockResolvedValue(response({ job: { ...job, keys: [...job.keys, `audio/${owner}/../escape`] }, blocked: false }))
  await expect(runMediaMaintenance(env(put), fetcher)).rejects.toThrow("Media maintenance failed")
  expect(put).not.toHaveBeenCalled()
})

it("exige confirmación de PUT y deja el lease reintentable ante fallo parcial", async () => {
  const put = vi.fn().mockResolvedValueOnce({ size: 0, etag: "etag-1" }).mockResolvedValueOnce(null)
  const fetcher = vi.fn().mockResolvedValueOnce(response({ job: { ...job, keys: [`audio/${owner}/a`, `video/${owner}/b`] }, blocked: false })).mockResolvedValue(response({ ok: true }))
  await expect(runMediaMaintenance(env(put), fetcher)).rejects.toThrow("Media maintenance failed")
  expect(put).toHaveBeenCalledTimes(2)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(unpack(fetcher.mock.calls[1][1]).action).toBe("retire")
})

it("permite reintentar el lease si retire falla y exige {ok:true}", async () => {
  const put = vi.fn().mockResolvedValue({ size: 0, etag: "etag-1" })
  let calls = 0
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const call = ++calls
    if (call === 1 || call === 3) return response({ job, blocked: false })
    if (call === 2) return response({ ok: false })
    if (call === 4) return response({ ok: true })
    expect(unpack(init).action).toBe("finish")
    return response({ ok: true })
  })
  await expect(runMediaMaintenance(env(put), fetcher)).rejects.toThrow("Media maintenance failed")
  await expect(runMediaMaintenance(env(put), fetcher)).resolves.toBeUndefined()
  expect(fetcher.mock.calls.map(([, init]) => unpack(init).action)).toEqual(["claim", "retire", "claim", "retire", "finish"])
})

it("firma el p_payload y termina después de todas las retiradas", async () => {
  const events: string[] = []
  const put = vi.fn(async (key: string, body: Uint8Array, options: { customMetadata: Record<string, string>; httpMetadata: { cacheControl: string } }) => {
    events.push(`put:${key}`)
    expect(body.byteLength).toBe(0)
    expect(options.customMetadata.estado).toBe("retirado")
    expect(options.httpMetadata.cacheControl).toBe("no-store")
    return { size: 0, etag: "etag-1" }
  })
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const outer = JSON.parse(String(init.body))
    expect(typeof outer.p_payload).toBe("string")
    expect(typeof outer.p_signature).toBe("string")
    const payload = JSON.parse(outer.p_payload)
    const key = await crypto.subtle.importKey("raw", Uint8Array.from("11".repeat(32).match(/../g)!, (x) => parseInt(x, 16)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(outer.p_signature.match(/../g)!, (x: string) => parseInt(x, 16)), new TextEncoder().encode(outer.p_payload))
    expect(valid).toBe(true)
    if (payload.action === "claim") return response({ job, blocked: false })
    events.push(payload.action === "retire" ? `retire:${payload.key}` : "finish")
    return response({ ok: true })
  })
  await runMediaMaintenance(env(put), fetcher)
  expect(events).toEqual([`put:${job.keys[0]}`, `retire:${job.keys[0]}`, "finish"])
})

it("finaliza lease vacío y rechaza blocked junto a un job", async () => {
  const put = vi.fn()
  const fetcher = vi.fn().mockImplementationOnce(async () => response({ job: { ...job, keys: [] }, blocked: false })).mockImplementationOnce(async (_url: string, init: RequestInit) => {
    expect(unpack(init).action).toBe("finish")
    return response({ ok: true })
  })
  await runMediaMaintenance(env(put), fetcher)
  expect(put).not.toHaveBeenCalled()
  await expect(runMediaMaintenance(env(put), async () => response({ job, blocked: true }))).rejects.toThrow("Media maintenance failed")
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { anonymousRequestIdentity, checkAnonymousRateLimit, normalizeNetworkIdentity, signAnonymousLimit } from "./anonymous-rate-limit"

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), client: vi.fn() }))
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.context }))
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }))
const key = "ab".repeat(32)
const request = (headers: Record<string, string> = {}) => new Request("https://example.test", { headers })
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("TRUSTED_PROXY", "true")
  vi.stubEnv("ANONYMOUS_RATE_LIMIT_KEY", key)
  vi.stubEnv("ANONYMOUS_RATE_LIMIT_KEY_ID", "test")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public")
  mocks.context.mockReturnValue({ cf: { colo: "LIM" } })
  mocks.client.mockReturnValue({ rpc: mocks.rpc })
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.useRealTimers() })

describe("identidad de red anónima", () => {
  it.each(["development", "test"])("ignora cabeceras en %s incluso con contexto simulado", environment => {
    vi.stubEnv("NODE_ENV", environment)
    expect(anonymousRequestIdentity(request({ "cf-connecting-ip": "203.0.113.2" }))).toBe("network:unknown")
  })
  it("no acepta el proxy declarado sin contexto del borde", () => {
    mocks.context.mockImplementation(() => { throw new Error("sin contexto") })
    expect(anonymousRequestIdentity(request({ "cf-connecting-ip": "203.0.113.2" }))).toBe("network:unknown")
  })
  it("no usa cabeceras alternativas elegidas por el visitante", () => {
    expect(anonymousRequestIdentity(request({ "x-forwarded-for": "203.0.113.2", "x-real-ip": "203.0.113.3" }))).toBe("network:unknown")
    expect(anonymousRequestIdentity(request({ "cf-connecting-ip": "203.0.113.4", "x-forwarded-for": "203.0.113.2" }))).toBe("ipv4:203.0.113.4")
  })
  it("agrupa IPv6 por red y normaliza IPv4 representada como IPv6", () => {
    expect(normalizeNetworkIdentity("2001:db8:1:2::1")).toBe(normalizeNetworkIdentity("2001:0db8:0001:0002::ffff"))
    expect(normalizeNetworkIdentity("::ffff:203.0.113.4")).toBe("ipv4:203.0.113.4")
    expect(normalizeNetworkIdentity("2001:db8:1:3::1")).not.toBe(normalizeNetworkIdentity("2001:db8:1:2::1"))
  })
  it.each(["", "garbage", "203.0.113.2, 203.0.113.3", "fe80::1%eth0"])("rechaza identidad inválida %s", raw => {
    expect(normalizeNetworkIdentity(raw)).toBeNull()
  })
})

describe("contador anónimo compartido", () => {
  it("firma el cuerpo completo sin transmitir la dirección", async () => {
    mocks.rpc.mockResolvedValue({ data: { is_allowed: true, remaining: 29, retry_after: 0 }, error: null })
    expect(await checkAnonymousRateLimit(request({ "cf-connecting-ip": "203.0.113.4" }), "oembed")).toEqual({ permitido: true, restantes: 29, reintentarEn: 0 })
    const [name, proof] = mocks.rpc.mock.calls[0]
    expect(name).toBe("consume_anonymous_rate_limit")
    expect(proof.p_payload).not.toContain("203.0.113.4")
    expect(JSON.parse(proof.p_payload)).toMatchObject({ version: 1, bucket: "oembed", keyId: "test" })
    expect(proof.p_signature).toBe(createHmac("sha256", Buffer.from(key, "hex")).update("vibe-anonymous-rate-limit\n" + proof.p_payload).digest("hex"))
  })
  it("una repetición conserva el sujeto; otro propósito cambia la firma", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01"))
    const a = signAnonymousLimit("oembed", "network:unknown", key, "test")
    const b = signAnonymousLimit("health", "network:unknown", key, "test")
    expect(JSON.parse(a.p_payload).subject).toBe(JSON.parse(b.p_payload).subject)
    expect(a.p_signature).not.toBe(b.p_signature)
  })
  it("sin clave bloquea sin consultar la base", async () => {
    vi.stubEnv("ANONYMOUS_RATE_LIMIT_KEY", "")
    expect(await checkAnonymousRateLimit(request(), "health")).toMatchObject({ permitido: false, unavailable: true })
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it("respeta el rechazo y tiempo de espera de la base", async () => {
    mocks.rpc.mockResolvedValue({ data: { is_allowed: false, remaining: 0, retry_after: 35 }, error: null })
    expect(await checkAnonymousRateLimit(request(), "health")).toEqual({ permitido: false, restantes: 0, reintentarEn: 35 })
  })
  it.each([null, {}, { is_allowed: true, remaining: 0, retry_after: 1 }, { is_allowed: false, remaining: 1, retry_after: 2 }, { is_allowed: false, remaining: 0, retry_after: 0 }])("cierra ante respuesta inválida %j", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    expect(await checkAnonymousRateLimit(request(), "health")).toMatchObject({ permitido: false, unavailable: true })
  })
  it("no permite operaciones si falla la conexión", async () => {
    mocks.rpc.mockRejectedValue(new Error("detalle privado"))
    expect(await checkAnonymousRateLimit(request(), "health")).toEqual({ permitido: false, restantes: 0, reintentarEn: 60, unavailable: true })
  })
})

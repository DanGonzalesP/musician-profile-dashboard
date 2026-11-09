import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), sign: vi.fn(), configured: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mock.auth }))
vi.mock("@/lib/r2", () => ({ r2Client: {}, R2_BUCKET_NAME: "ficticio" }))
vi.mock("@/lib/r2-object-lifecycle", () => ({ createImmutableUpload: mock.sign }))
vi.mock("@/lib/r2-config", () => ({ subidasR2Configuradas: mock.configured }))
vi.mock("@/lib/rate-limit", () => ({ checkAuthenticatedRateLimit: async () => ({ permitido: true }), respuesta429: vi.fn() }))
vi.mock("@/lib/log", () => ({ idDePeticion: () => "prueba", logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }))
import { POST } from "./route"

const actor = "00000000-0000-4000-8000-000000000001"
const uploadId = "00000000-0000-4000-8000-000000000002"
const key = `images/${actor}/${uploadId}.webp`
const request = (extra = {}) => new Request("http://localhost/api/upload-url", { method: "POST",
  body: JSON.stringify({ folder: "images", extension: "webp", contentType: "image/webp", bytes: 100, uploadId, ...extra }) })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("MEDIA_RECEIPT_KEY", "ab".repeat(32))
  mock.auth.mockResolvedValue({ user: { id: actor }, supabase: { rpc: mock.rpc } })
  mock.configured.mockReturnValue(true)
  mock.rpc.mockResolvedValue({ error: null, data: { key, state: "pending", expiresAt: new Date(Date.now() + 120_000).toISOString() } })
  mock.sign.mockResolvedValue("https://upload.example.invalid/firmado")
})
afterEach(() => vi.unstubAllEnvs())

it("reserva con recibo del servidor y JWT, firma dentro del plazo original y no publica aún", async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  const receipt = JSON.parse(mock.rpc.mock.calls[0][1].p_payload)
  expect(mock.rpc.mock.calls[0][0]).toBe("reserve_media_upload")
  expect(receipt).toMatchObject({ action: "reserve", actor, key, bytes: 100, contentType: "image/webp" })
  expect(mock.sign.mock.calls[0][5]).toBeGreaterThan(0)
  expect(mock.sign.mock.calls[0][5]).toBeLessThanOrEqual(120)
  expect(await response.json()).toMatchObject({ key, headers: { "If-None-Match": "*" } })
  expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.sign.mock.invocationCallOrder[0])
})
it.each([["PT413", 413], ["PT409", 409], ["PT503", 503], ["42501", 503]])(
  "no firma si Postgres rechaza %s", async (code, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code, message: "detalle privado" } })
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.text()).not.toContain("detalle privado")
    expect(mock.sign).not.toHaveBeenCalled()
  },
)
it.each([null, {}, { key, state: "pending", expiresAt: "inválida" }, { key: "ajena", state: "pending", expiresAt: new Date().toISOString() }])(
  "no firma reservas inválidas %j", async data => {
    mock.rpc.mockResolvedValue({ error: null, data })
    expect((await POST(request())).status).toBe(503)
    expect(mock.sign).not.toHaveBeenCalled()
  },
)
it("no renueva una reserva vencida", async () => {
  mock.rpc.mockResolvedValue({ error: null, data: { key, state: "pending", expiresAt: new Date(Date.now() - 1000).toISOString() } })
  expect((await POST(request())).status).toBe(409)
  expect(mock.sign).not.toHaveBeenCalled()
})
it("sin recibos configurados no toca la base ni firma", async () => {
  vi.stubEnv("MEDIA_RECEIPT_KEY", "")
  expect((await POST(request())).status).toBe(503)
  expect(mock.rpc).not.toHaveBeenCalled()
  expect(mock.sign).not.toHaveBeenCalled()
})
it("exige sesión y valida identificadores antes de reservar", async () => {
  expect((await POST(request({ uploadId: "../otro" }))).status).toBe(400)
  expect(mock.rpc).not.toHaveBeenCalled()
  mock.auth.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
})

import { afterEach, beforeEach, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ auth: vi.fn(), asset: vi.fn(), rpc: vi.fn(), head: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mock.auth }))
vi.mock("@/lib/r2", () => ({ r2Client: {}, R2_BUCKET_NAME: "ficticio", R2_PUBLIC_URL: "https://media.example.invalid" }))
vi.mock("@/lib/r2-object-lifecycle", () => ({ verifyUploadedObject: mock.head }))
vi.mock("@/lib/r2-config", () => ({ subidasR2Configuradas: () => true }))
vi.mock("@/lib/rate-limit", () => ({ checkAuthenticatedRateLimit: async () => ({ permitido: true }), respuesta429: vi.fn() }))
vi.mock("@/lib/log", () => ({ idDePeticion: () => "prueba", logError: vi.fn() }))
import { POST } from "./route"
const actor = "00000000-0000-4000-8000-000000000001"
const key = `images/${actor}/00000000-0000-4000-8000-000000000002.webp`
const request = (overrides = {}) => new Request("http://localhost/api/finalize-upload", {
  method: "POST", body: JSON.stringify({ key, ...overrides }),
})
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("MEDIA_RECEIPT_KEY", "ab".repeat(32))
  mock.auth.mockResolvedValue({ user: { id: actor }, supabase: {
    rpc: mock.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.asset }) }) }),
  } })
  mock.asset.mockResolvedValue({ error: null, data: { bytes: 100, content_type: "image/webp", owner_user_id: actor } })
  mock.head.mockResolvedValue({ bytes: 100, contentType: "image/webp", etag: '"verified"' })
  mock.rpc.mockResolvedValue({ error: null, data: true })
})
afterEach(() => vi.unstubAllEnvs())
it("solo devuelve URL después de verificar metadata de la base y finalizar con recibo", async () => {
  const response = await POST(request({ bytes: 1, contentType: "image/png" }))
  expect(response.status).toBe(200)
  expect(mock.head).toHaveBeenCalledWith({}, "ficticio", key, { bytes: 100, contentType: "image/webp" })
  expect(mock.rpc.mock.calls[0][0]).toBe("finalize_media_upload")
  expect(JSON.parse(mock.rpc.mock.calls[0][1].p_payload)).toMatchObject({ action: "finalize", actor, key, bytes: 100, etag: '"verified"' })
  expect(mock.head.mock.invocationCallOrder[0]).toBeLessThan(mock.rpc.mock.invocationCallOrder[0])
  expect(await response.json()).toEqual({ publicUrl: `/api/media/${key}` })
})
it("un HEAD ausente o inválido nunca autoriza la publicación", async () => {
  mock.head.mockRejectedValue(new Error("detalle privado"))
  const response = await POST(request())
  expect(response.status).toBe(409)
  expect(await response.text()).not.toContain("detalle privado")
  expect(mock.rpc).not.toHaveBeenCalled()
})
it.each([{ error: { code: "PT409" }, data: null }, { error: null, data: false }])("no publica si no confirma Postgres", async result => {
  mock.rpc.mockResolvedValue(result)
  const response = await POST(request())
  expect(response.ok).toBe(false)
  expect(await response.text()).not.toContain("publicUrl")
})
it("no consulta R2 sin sesión, propiedad o reserva", async () => {
  expect((await POST(request({ key: key.replace(actor, "00000000-0000-4000-8000-000000000099") }))).status).toBe(400)
  mock.asset.mockResolvedValue({ data: null, error: null })
  expect((await POST(request())).status).toBe(404)
  mock.auth.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
  expect(mock.head).not.toHaveBeenCalled()
})

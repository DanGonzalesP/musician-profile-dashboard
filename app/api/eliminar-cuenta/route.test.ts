import { beforeEach, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({
  auth: vi.fn(), close: vi.fn(), configured: vi.fn(), receipts: vi.fn(), limit: vi.fn(),
}))
vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mock.auth }))
vi.mock("@/lib/account-media", () => ({ continueAccountClosure: mock.close }))
vi.mock("@/lib/r2", () => ({ r2Client: {}, R2_BUCKET_NAME: "ficticio" }))
vi.mock("@/lib/r2-object-lifecycle", () => ({ tombstoneUploadedObject: vi.fn() }))
vi.mock("@/lib/r2-config", () => ({ subidasR2Configuradas: mock.configured }))
vi.mock("@/lib/media-receipt", () => ({ mediaReceiptsConfigured: mock.receipts }))
vi.mock("@/lib/log", () => ({ idDePeticion: () => "local", logError: vi.fn(), logInfo: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  checkAuthenticatedRateLimit: mock.limit,
  respuesta429: () => new Response("Espera", { status: 429 }),
}))
import { POST } from "./route"
const request = () => new Request("http://localhost/api/eliminar-cuenta", { method: "POST" })
const result = { eliminada: true, archivosRetirados: 1, archivosPendientes: 0, requiereRevision: false }
beforeEach(() => {
  vi.resetAllMocks()
  mock.auth.mockResolvedValue({ user: { id: "ficticio" }, supabase: {} })
  mock.configured.mockReturnValue(true)
  mock.receipts.mockReturnValue(true)
  mock.limit.mockResolvedValue({ permitido: true })
  mock.close.mockResolvedValue(result)
})
it("un fallo no expone detalles internos", async () => {
  mock.close.mockRejectedValue(new Error("detalle privado ficticio"))
  const response = await POST(request())
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain("detalle privado")
})
it("espera la confirmación del protocolo antes de responder éxito", async () => {
  let finish!: (value: typeof result) => void
  mock.close.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  let completed = false
  const pending = POST(request()).then(value => { completed = true; return value })
  await vi.waitFor(() => expect(mock.close).toHaveBeenCalled())
  expect(completed).toBe(false)
  finish(result)
  const response = await pending
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(mock.limit).toHaveBeenCalledWith({}, "account-closure")
})
it("sin sesión no inicia el cierre", async () => {
  mock.auth.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
  expect(mock.close).not.toHaveBeenCalled()
})
it.each(["storage", "receipts"])("sin configuración de %s no congela la cuenta", async missing => {
  if (missing === "storage") mock.configured.mockReturnValue(false)
  else mock.receipts.mockReturnValue(false)
  expect((await POST(request())).status).toBe(503)
  expect(mock.close).not.toHaveBeenCalled()
})
it("respeta el límite compartido antes de congelar", async () => {
  mock.limit.mockResolvedValue({ permitido: false, reintentarEn: 60 })
  expect((await POST(request())).status).toBe(429)
  expect(mock.close).not.toHaveBeenCalled()
})
it("un cierre pendiente responde 202 sin afirmar que la cuenta desapareció", async () => {
  const progress = { ...result, eliminada: false, archivosPendientes: 5, requiereRevision: true }
  mock.close.mockResolvedValue(progress)
  const response = await POST(request())
  expect(response.status).toBe(202)
  expect(await response.json()).toEqual(progress)
})

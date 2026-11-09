import { beforeEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  auth: vi.fn(), configured: vi.fn(), deleteOwned: vi.fn(), tombstone: vi.fn(), ownedKeys: [] as string[], legacy: "",
}))
vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mock.auth }))
vi.mock("@/lib/r2-config", () => ({ subidasR2Configuradas: mock.configured }))
vi.mock("@/lib/r2", () => ({ r2Client: {}, R2_BUCKET_NAME: "ficticio", get R2_PUBLIC_URL() { return mock.legacy } }))
vi.mock("@/lib/r2-object-lifecycle", () => ({ tombstoneUploadedObject: mock.tombstone }))
vi.mock("@/lib/media-deletion", () => ({ deleteOwnedMedia: mock.deleteOwned }))
vi.mock("@/lib/log", () => ({ idDePeticion: () => "prueba", logError: vi.fn(), logInfo: vi.fn() }))
import { POST } from "./route"

const actor = "00000000-0000-4000-8000-000000000001"
const own = `images/${actor}/00000000-0000-4000-8000-000000000002.webp`
const foreign = "images/00000000-0000-4000-8000-000000000009/00000000-0000-4000-8000-000000000003.webp"
const request = (urls: unknown) => new Request("http://localhost/api/delete-file", { method: "POST", body: JSON.stringify({ urls }) })
const select = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  mock.legacy = ""
  mock.ownedKeys = [own]
  mock.configured.mockReturnValue(true)
  select.mockImplementation(() => ({ in: async (_column: string, keys: string[]) => ({
    data: keys.filter(key => mock.ownedKeys.includes(key)).map(key => ({ key })), error: null,
  }) }))
  mock.auth.mockResolvedValue({ user: { id: actor }, supabase: { from: () => ({ select }) } })
  mock.deleteOwned.mockResolvedValue(true)
})

it("sin origen histórico configurado borra por /api/media sólo lo propio", async () => {
  const response = await POST(request([`/api/media/${own}`, `/api/media/${foreign}`]))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    deleted: [`/api/media/${own}`], skipped: [`/api/media/${foreign}`], failed: [],
  })
  expect(mock.deleteOwned).toHaveBeenCalledTimes(1)
  expect(mock.deleteOwned.mock.calls[0][1]).toBe(own)
  expect(mock.deleteOwned.mock.calls[0][3]).toBe(actor)
})

it("sin origen histórico, un enlace https antiguo no se interpreta como R2", async () => {
  const response = await POST(request([`https://pub-ejemplo.r2.dev/${own}`]))
  expect(await response.json()).toEqual({ deleted: [], skipped: [`https://pub-ejemplo.r2.dev/${own}`], failed: [] })
  expect(select).not.toHaveBeenCalled()
  expect(mock.deleteOwned).not.toHaveBeenCalled()
})

it("con origen histórico configurado reconoce el enlace antiguo exacto", async () => {
  mock.legacy = "https://pub-ejemplo.r2.dev"
  const response = await POST(request([`https://pub-ejemplo.r2.dev/${own}`, `https://otro.example/${own}`]))
  expect((await response.json()).deleted).toEqual([`https://pub-ejemplo.r2.dev/${own}`])
  expect(mock.deleteOwned).toHaveBeenCalledTimes(1)
})

it("con S3 incompleto responde 503 antes de consultar propiedad o reservar borrados", async () => {
  mock.configured.mockReturnValue(false)
  const response = await POST(request([`/api/media/${own}`]))
  expect(response.status).toBe(503)
  expect(select).not.toHaveBeenCalled()
  expect(mock.deleteOwned).not.toHaveBeenCalled()
})

it("un archivo aún en uso se omite y un fallo de R2 se informa sin detalles internos", async () => {
  const second = `audio/${actor}/00000000-0000-4000-8000-000000000004.mp3`
  mock.ownedKeys = [own, second]
  mock.deleteOwned.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("detalle interno de R2"))
  const response = await POST(request([`/api/media/${own}`, `/api/media/${second}`]))
  const body = await response.json()
  expect(body).toEqual({ deleted: [], skipped: [`/api/media/${own}`, `/api/media/${second}`], failed: [`/api/media/${second}`] })
  expect(JSON.stringify(body)).not.toContain("detalle interno")
})

it("exige sesión y rechaza listas inválidas", async () => {
  mock.auth.mockResolvedValueOnce(null)
  expect((await POST(request([`/api/media/${own}`]))).status).toBe(401)
  expect((await POST(request([]))).status).toBe(400)
  expect((await POST(request([42]))).status).toBe(400)
  expect(mock.deleteOwned).not.toHaveBeenCalled()
})

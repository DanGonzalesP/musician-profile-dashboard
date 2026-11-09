import { beforeEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  deleteOwnedMedia: vi.fn(),
}))

vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mock.auth }))
vi.mock("@/lib/r2", () => ({
  r2Client: { send: mock.send },
  R2_BUCKET_NAME: "ficticio",
  R2_PUBLIC_URL: "https://media.example.invalid",
}))
vi.mock("@/lib/r2-object-lifecycle", () => ({ tombstoneUploadedObject: vi.fn() }))
vi.mock("@/lib/media-deletion", () => ({ deleteOwnedMedia: mock.deleteOwnedMedia }))
vi.mock("@/lib/log", () => ({ logError: vi.fn(), logInfo: vi.fn() }))

import { POST } from "./route"

const actor = "00000000-0000-4000-8000-000000000001"
const request = () => new Request("http://localhost/api/cleanup-orphaned-files", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ folder: "invalid" }),
})

beforeEach(() => {
  vi.resetAllMocks()
  mock.auth.mockResolvedValue({ user: { id: actor }, supabase: { rpc: mock.rpc } })
  mock.rpc.mockResolvedValue({ data: true, error: null })
})

it("sin sesión devuelve 401 sin llamar a R2", async () => {
  mock.auth.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
  expect(mock.rpc).not.toHaveBeenCalled()
  expect(mock.send).not.toHaveBeenCalled()
})

it.each([
  ["revocado", { data: false, error: null }, false],
  ["error RPC", { data: true, error: { message: "denegado" } }, false],
  ["excepción RPC", undefined, true],
])("%s devuelve 403 sin listar ni borrar", async (_case, result, throws) => {
  if (throws) mock.rpc.mockRejectedValue(new Error("fallo RPC"))
  else mock.rpc.mockResolvedValue(result)

  expect((await POST(request())).status).toBe(403)
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("has_platform_permission", {
    p_permission: "maintenance",
  })
  expect(mock.send).not.toHaveBeenCalled()
  expect(mock.deleteOwnedMedia).not.toHaveBeenCalled()
})

it("con permiso comprueba maintenance y continúa hasta validar la carpeta", async () => {
  expect((await POST(request())).status).toBe(400)
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("has_platform_permission", {
    p_permission: "maintenance",
  })
  expect(mock.send).not.toHaveBeenCalled()
})

it("una revocación durante la misma sesión bloquea la siguiente petición", async () => {
  mock.rpc.mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: false, error: null })

  expect((await POST(request())).status).toBe(400)
  expect((await POST(request())).status).toBe(403)
  expect(mock.auth).toHaveBeenCalledTimes(2)
  expect(mock.rpc).toHaveBeenCalledTimes(2)
  expect(mock.rpc).toHaveBeenNthCalledWith(1, "has_platform_permission", {
    p_permission: "maintenance",
  })
  expect(mock.rpc).toHaveBeenNthCalledWith(2, "has_platform_permission", {
    p_permission: "maintenance",
  })
  expect(mock.send).not.toHaveBeenCalled()
})

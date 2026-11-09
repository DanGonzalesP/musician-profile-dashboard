import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, HEAD } from "./route"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), configured: vi.fn() }))
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ rpc: mocks.rpc }) }))
vi.mock("@/lib/r2", () => ({ r2Client: { send: mocks.send }, R2_BUCKET_NAME: "private-fixture" }))
vi.mock("@/lib/r2-config", () => ({ subidasR2Configuradas: mocks.configured }))
vi.mock("@/lib/log", () => ({ logError: vi.fn() }))
const context = { params: Promise.resolve({ key: ["images", "owner", "test.png"] }) }
const request = (method = "GET", headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/media/images/owner/test.png", { method, headers })
const object = () => ({ ContentType: "image/png", ContentLength: 4,
  Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3, 4])); c.close() } }) } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54421")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon")
  mocks.configured.mockReturnValue(true)
  mocks.rpc.mockResolvedValue({ data: [{ content_type: "image/png", bytes: 4 }], error: null })
  mocks.send.mockImplementation(async () => object())
})
it("autoriza de nuevo el mismo enlace y no entrega objeto ni tamaño tras suspensión", async () => {
  const first = await GET(request(), context)
  expect(first.status).toBe(200)
  expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([1, 2, 3, 4])
  expect(first.headers.get("cache-control")).toContain("no-store")
  expect(first.headers.get("cloudflare-cdn-cache-control")).toBe("no-store")
  expect(first.headers.has("location")).toBe(false)
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  const second = await GET(request("GET", { "if-none-match": "previous", range: "bytes=0-1" }), context)
  expect(second.status).toBe(404)
  expect(second.headers.has("content-length")).toBe(false)
  expect(mocks.send).toHaveBeenCalledTimes(1)
})
it("HEAD también autoriza y no descarga el cuerpo", async () => {
  mocks.send.mockResolvedValue({ ContentType: "image/png", ContentLength: 4 })
  const response = await HEAD(request("HEAD", { range: "bytes=0-1" }), context)
  expect(response.status).toBe(200)
  expect(response.headers.get("content-length")).toBe("4")
  expect(await response.text()).toBe("")
  expect(mocks.send.mock.calls[0][0].constructor.name).toBe("HeadObjectCommand")
})
it("sirve un rango validado con 206 para poder avanzar audio/vídeo", async () => {
  mocks.send.mockResolvedValue({ ...object(), ContentLength: 2, ContentRange: "bytes 1-2/4",
    Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([2, 3])); c.close() } }) } })
  const response = await GET(request("GET", { range: "bytes=1-2" }), context)
  expect(response.status).toBe(206)
  expect(response.headers.get("content-range")).toBe("bytes 1-2/4")
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3])
})
it("rechaza rangos fuera del objeto sin contactar almacenamiento", async () => {
  const response = await GET(request("GET", { range: "bytes=20-" }), context)
  expect(response.status).toBe(416)
  expect(mocks.send).not.toHaveBeenCalled()
})
it("no sirve HTML/SVG ni un objeto distinto al inventariado", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [{ content_type: "image/svg+xml", bytes: 4 }], error: null })
  expect((await GET(request(), context)).status).toBe(404)
  expect(mocks.send).not.toHaveBeenCalled()
  mocks.send.mockResolvedValueOnce({ ...object(), ContentType: "text/html" })
  expect((await GET(request(), context)).status).toBe(404)
})
it("falla cerrado y no expone errores de base ni almacenamiento", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private database detail" } })
  expect((await GET(request(), context)).status).toBe(503)
  expect(mocks.send).not.toHaveBeenCalled()
  mocks.send.mockRejectedValueOnce(new Error("private provider detail"))
  const response = await GET(request(), context)
  expect(response.status).toBe(503)
  expect(await response.text()).toBe("")
})

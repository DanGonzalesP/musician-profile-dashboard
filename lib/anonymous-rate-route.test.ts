import { afterEach, describe, expect, it, vi } from "vitest"
const { check } = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock("./anonymous-rate-limit", async importOriginal => {
  const original = await importOriginal<typeof import("./anonymous-rate-limit")>()
  return { ...original, checkAnonymousRateLimit: check }
})
import { GET } from "../app/api/oembed/route"
afterEach(() => vi.resetAllMocks())
describe("ruta pública y contador compartido", () => {
  it("no consulta proveedores si falta el contador", async () => {
    check.mockResolvedValue({ permitido: false, unavailable: true, restantes: 0, reintentarEn: 60 })
    const response = await GET(new Request("https://example.test/api/oembed"))
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("retry-after")).toBe("60")
  })
  it("devuelve el plazo del límite agotado sin cachearlo", async () => {
    check.mockResolvedValue({ permitido: false, restantes: 0, reintentarEn: 19 })
    const request = new Request("https://example.test/api/oembed")
    const response = await GET(request)
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("19")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(check).toHaveBeenCalledWith(request, "oembed")
  })
  it("con cupo continúa la validación normal del enlace", async () => {
    check.mockResolvedValue({ permitido: true, restantes: 29, reintentarEn: 0 })
    const response = await GET(new Request("https://example.test/api/oembed"))
    expect(response.status).toBe(400)
  })
})

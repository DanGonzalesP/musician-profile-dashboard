import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { GET, HEAD } from "./route"

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

const getContext = vi.mocked(getCloudflareContext)
const wasm = new Uint8Array([0, 97, 115, 109])

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe("ruta privada del WASM de ffmpeg", () => {
  beforeEach(() => getContext.mockReset())

  it("sirve únicamente el objeto esperado y revalida la ruta sin versión", async () => {
    const get = vi.fn().mockResolvedValue({
      body: stream(wasm),
      size: wasm.byteLength,
      etag: "asset-etag",
    })
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: { get } } } as never)

    const response = await GET(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/wasm")
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wasm)
    expect(get).toHaveBeenCalledExactlyOnceWith("ffmpeg-core.wasm")
  })

  it("reutiliza el WASM sólo si el ETag sigue coincidiendo", async () => {
    const get = vi.fn().mockResolvedValue({ body: stream(wasm), size: wasm.byteLength, httpEtag: '"v1"' })
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: { get } } } as never)
    const response = await GET(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm", {
      headers: { "If-None-Match": '"v1"' },
    }))
    expect(response.status).toBe(304)
    expect(await response.text()).toBe("")
    expect(response.headers.has("content-length")).toBe(false)
  })

  it("falla cerrado si falta el binding o R2 no responde", async () => {
    getContext.mockImplementation(() => { throw new Error("sin contexto") })
    expect((await GET(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm"))).status).toBe(503)
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: {
      get: vi.fn().mockRejectedValue(new Error("error privado de R2")),
    } } } as never)
    const response = await GET(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm"))
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("Asset no disponible")
  })

  it("devuelve 404 si el objeto no existe", async () => {
    const get = vi.fn().mockResolvedValue(null)
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: { get } } } as never)

    const response = await GET(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm"))

    expect(response.status).toBe(404)
  })

  it("no permite usar la ruta para leer otras claves del bucket", async () => {
    const get = vi.fn()
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: { get } } } as never)

    const response = await GET(new Request("https://vibe.test/ffmpeg/otro.wasm"))

    expect(response.status).toBe(404)
    expect(get).not.toHaveBeenCalled()
  })

  it("responde HEAD con metadatos sin devolver el binario", async () => {
    const head = vi.fn().mockResolvedValue({ size: wasm.byteLength, etag: "asset-etag" })
    getContext.mockReturnValue({ env: { VIBE_STATIC_ASSETS: { head } } } as never)

    const response = await HEAD(new Request("https://vibe.test/ffmpeg/ffmpeg-core.wasm", { method: "HEAD" }))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe(String(wasm.byteLength))
    expect(await response.text()).toBe("")
    expect(head).toHaveBeenCalledExactlyOnceWith("ffmpeg-core.wasm")
  })
})

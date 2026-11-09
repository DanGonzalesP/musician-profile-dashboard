import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ load: vi.fn(), exec: vi.fn(), write: vi.fn(), read: vi.fn(), remove: vi.fn(), on: vi.fn(), off: vi.fn(), terminate: vi.fn(), fetch: vi.fn() }))
vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: class {
  load = mock.load; exec = mock.exec; writeFile = mock.write; readFile = mock.read; deleteFile = mock.remove; on = mock.on; off = mock.off
  terminate = mock.terminate
} }))
vi.mock("@ffmpeg/util", () => ({ fetchFile: async (file: File) => new Uint8Array(await file.arrayBuffer()), toBlobURL: async (url: string) => url }))
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  mock.load.mockResolvedValue(true); mock.exec.mockResolvedValue(0); mock.remove.mockResolvedValue(undefined)
  mock.read.mockResolvedValue(new Uint8Array([1, 2]))
  // El core se descarga del propio origen y se entrega como blob: URL.
  mock.fetch.mockImplementation(async () => new Response(new Uint8Array([0])))
  vi.stubGlobal("fetch", mock.fetch)
})
afterEach(() => vi.unstubAllGlobals())
it("reintenta cargar el core después de una dependencia fallida", async () => {
  mock.load.mockRejectedValueOnce(new Error("red"))
  const { ensureCompressedAudio } = await import("./audio-transcode")
  const file = new File(["audio"], "prueba.wav")
  await expect(ensureCompressedAudio(file)).rejects.toThrow("red")
  // El worker fallido se termina; el siguiente intento crea uno nuevo.
  expect(mock.terminate).toHaveBeenCalled()
  expect((await ensureCompressedAudio(file)).name).toBe("prueba.mp3")
  expect(mock.load).toHaveBeenCalledTimes(2)
  expect(mock.fetch.mock.calls.map(([url]) => url)).toContain("/ffmpeg/ffmpeg-core.wasm")
})
it("dos conversiones y una sonda concurrentes no comparten archivos ni eventos activos", async () => {
  let release!: () => void
  mock.exec.mockImplementationOnce(() => new Promise<number>(resolve => { release = () => resolve(0) }))
  const { ensureCompressedAudio, getAccurateAudioDuration } = await import("./audio-transcode")
  const first = ensureCompressedAudio(new File(["uno"], "uno.wav"))
  const second = ensureCompressedAudio(new File(["dos"], "dos.wav"))
  const probe = getAccurateAudioDuration(new File(["tres"], "tres.wav"))
  await vi.waitFor(() => expect(mock.exec).toHaveBeenCalledTimes(1))
  expect(mock.write).toHaveBeenCalledTimes(1)
  release()
  await Promise.all([first, second, probe])
  expect(mock.exec).toHaveBeenCalledTimes(3)
  expect(mock.remove).toHaveBeenCalledTimes(5)
})
it("un código de salida fallido no publica restos de otra conversión y libera la cola", async () => {
  mock.exec.mockResolvedValueOnce(1)
  const { ensureCompressedAudio } = await import("./audio-transcode")
  await expect(ensureCompressedAudio(new File(["x"], "x.wav"))).rejects.toThrow("convertir")
  expect(mock.read).not.toHaveBeenCalled()
  await expect(ensureCompressedAudio(new File(["y"], "y.wav"))).resolves.toHaveProperty("name", "y.mp3")
})

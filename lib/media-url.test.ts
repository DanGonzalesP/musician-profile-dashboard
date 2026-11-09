import { afterEach, expect, it, vi } from "vitest"
import { collectMediaUrls, mediaKeyFromUrl, mediaUrl, rewriteMediaUrls } from "./media-url"
import { normalizeBlockData } from "./blocks"
import { rowToProduct, rowToService } from "./catalog"
vi.mock("@/lib/supabase", () => ({ supabase: {} }))
afterEach(() => vi.unstubAllEnvs())

it("traduce el origen histórico configurado y conserva enlaces externos y embeds", () => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://media.example/prefix")
  const original = { image: "https://media.example/prefix/images/user/photo.png", embed: "https://youtube.com/watch?v=123", items: ["https://external.example/audio/a.mp3"] }
  expect(rewriteMediaUrls(original)).toEqual({ ...original, image: "/api/media/images/user/photo.png" })
  expect(original.image).toContain("https://")
  expect(mediaKeyFromUrl("https://media.example.attacker/prefix/images/user/photo.png")).toBeNull()
  expect(mediaKeyFromUrl("https://media.example/elsewhere/images/user/photo.png")).toBeNull()
  expect(mediaKeyFromUrl("https://attacker@media.example/prefix/images/user/photo.png")).toBeNull()
  expect(mediaUrl("blob:temporary-preview")).toBe("blob:temporary-preview")
})
it("compara enlaces antiguos y nuevos por el mismo archivo para no retirarlo al publicar", () => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://media.example")
  expect(collectMediaUrls(["https://media.example/audio/user/song.mp3", "/api/media/audio/user/song.mp3"])).toEqual(new Set(["/api/media/audio/user/song.mp3"]))
})
it("bloques, catálogo y borradores anidados producen URLs de entrega privada", () => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://media.example")
  const url = "https://media.example/images/u/photo.png"
  const expected = "/api/media/images/u/photo.png"
  expect(normalizeBlockData("hero", { image: url })).toMatchObject({ image: expected })
  expect(rowToProduct({ id: "p", images_urls: [url] }).imageUrl).toBe(expected)
  expect(rowToService({ id: "s", image_url: url }).imageUrl).toBe(expected)
  expect(rewriteMediaUrls({ blocks: [{ data: { items: [{ url }] } }] })).toEqual({ blocks: [{ data: { items: [{ url: expected }] } }] })
})

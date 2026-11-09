import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => ({ suspended: false, version: 1, unavailable: false, reads: 0, hero: {} as Record<string, string>, cache: new Map<string, unknown>() }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
  const key = JSON.stringify(keys)
  if (!fixture.cache.has(key)) fixture.cache.set(key, await fn())
  return fixture.cache.get(key)
} }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (table: string) => {
  const result = () => ({ error: fixture.unavailable ? { code: "503" } : null,
    data: table === "profiles" ? { id: "perfil", username: "artista", content_version: fixture.version,
      is_suspended: fixture.suspended } : table === "profile_blocks" ? [{ block_type: "hero", content: { tagline: `v${fixture.version}`, ...fixture.hero } }] : [] })
  const query = { select: () => query, eq: () => query, order: async () => { fixture.reads++; return result() },
    maybeSingle: async () => result() }
  return query
} }) }))
import { fetchProfileMeta, fetchPublicProfilePage } from "./supabase-server"

describe("perfil público con caché caliente", () => {
  beforeEach(() => { fixture.suspended = false; fixture.version = 1; fixture.unavailable = false; fixture.reads = 0; fixture.hero = {}; fixture.cache.clear() })
  afterEach(() => vi.unstubAllEnvs())
  it("los metadatos sociales usan entrega revocable y desaparecen al suspender aun con caché caliente", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://media.example")
    fixture.hero = { image: "https://media.example/images/user/photo.png", banner: "https://media.example/images/user/banner.jpg" }
    expect(await fetchProfileMeta("artista")).toMatchObject({
      image: "/api/media/images/user/photo.png", banner: "/api/media/images/user/banner.jpg",
    })
    fixture.suspended = true
    expect(await fetchProfileMeta("artista")).toBeNull()
  })
  it("reutiliza contenido pero deniega una suspensión posterior sin depender de invalidación", async () => {
    expect((await fetchPublicProfilePage("artista")).estado).toBe("ok")
    expect((await fetchPublicProfilePage("artista")).estado).toBe("ok")
    expect(fixture.reads).toBe(3)
    fixture.suspended = true
    expect(await fetchPublicProfilePage("artista")).toEqual({ estado: "no-encontrado" })
  })
  it("una publicación confirmada cambia la clave aunque se pierda la invalidación", async () => {
    await fetchPublicProfilePage("artista")
    fixture.version = 2
    const result = await fetchPublicProfilePage("artista")
    expect(result.estado === "ok" && result.datos.blockRows[0].content).toEqual({ tagline: "v2" })
  })
  it("un fallo de autorización no entrega el contenido cacheado y permite reintentar", async () => {
    await fetchPublicProfilePage("artista")
    fixture.unavailable = true
    expect(await fetchPublicProfilePage("artista")).toEqual({ estado: "sin-servidor" })
    fixture.unavailable = false
    expect((await fetchPublicProfilePage("artista")).estado).toBe("ok")
  })
})

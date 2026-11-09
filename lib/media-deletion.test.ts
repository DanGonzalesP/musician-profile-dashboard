import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { deleteOwnedMedia } from "./media-deletion"

const claim = vi.fn()
const erase = vi.fn()
const remove = vi.fn()
const actor = "00000000-0000-4000-8000-000000000001"
const supabase = { rpc: (name: string, args: unknown) =>
  name === "claim_media_deletion" ? claim(args) : erase(args) } as unknown as SupabaseClient
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("MEDIA_RECEIPT_KEY", "ab".repeat(32))
  claim.mockResolvedValue({ data: true, error: null })
  erase.mockResolvedValue({ data: true, error: null })
  remove.mockResolvedValue({ bytes: 0, etag: '"empty"' })
})
afterEach(() => vi.unstubAllEnvs())
describe("borrado coordinado con referencias", () => {
  it.each(["images/legacy con espacios.png", "audio/../images/a.png", "images/a%2Fb.png", "otro/a.png"])(
    "rechaza una key fuera de la gramática verificable: %s", async key => {
      expect(await deleteOwnedMedia(supabase, key, remove, actor)).toBe(false)
      expect(claim).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
    },
  )
  it.each([false, null, undefined, "true"])("no toca R2 sin autorización booleana: %s", async data => {
    claim.mockResolvedValue({ data, error: null })
    expect(await deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(erase).not.toHaveBeenCalled()
  })
  it("un error de reclamación aborta antes de R2", async () => {
    claim.mockResolvedValue({ data: true, error: { message: "interno" } })
    await expect(deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).rejects.toThrow("reservar")
    expect(remove).not.toHaveBeenCalled()
  })
  it("mantiene inventario cuando falla R2 y admite reintento", async () => {
    remove.mockRejectedValueOnce(new Error("R2"))
    await expect(deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).rejects.toThrow("R2")
    expect(erase).not.toHaveBeenCalled()
    expect(await deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).toBe(true)
    expect(claim).toHaveBeenCalledTimes(2)
    expect(remove.mock.invocationCallOrder[1]).toBeLessThan(erase.mock.invocationCallOrder[0])
  })
  it("no informa éxito si falla la confirmación en base", async () => {
    erase.mockResolvedValue({ error: { message: "interno" } })
    await expect(deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).rejects.toThrow("confirmar")
    expect(remove).toHaveBeenCalledOnce()
  })
  it("emite el recibo de retirada después de confirmar el marcador", async () => {
    expect(await deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).toBe(true)
    expect(JSON.parse(erase.mock.calls[0][0].p_payload)).toMatchObject({ action: "retire", actor,
      key: "audio/archivo.mp3", bytes: 0, etag: '"empty"' })
  })
  it("sin clave no altera R2 ni libera inventario", async () => {
    vi.stubEnv("MEDIA_RECEIPT_KEY", "")
    await expect(deleteOwnedMedia(supabase, "audio/archivo.mp3", remove, actor)).rejects.toThrow("configurada")
    expect(remove).not.toHaveBeenCalled()
    expect(erase).not.toHaveBeenCalled()
  })
})


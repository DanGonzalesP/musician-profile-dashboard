import { beforeEach, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const deletion = vi.hoisted(() => vi.fn())
vi.mock("@/lib/media-deletion", () => ({ deleteOwnedMedia: deletion }))
import { continueAccountClosure } from "./account-media"

const pending = { keys: ["audio/uno"], remaining: 1, total: 1, blocked: false }
const empty = { keys: [], remaining: 0, total: 1, blocked: false }
function client(batches: unknown[], overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name in overrides) return overrides[name]
    if (name === "begin_media_account_closure") return { data: true, error: null }
    if (name === "get_media_account_closure_batch") return { data: batches.shift(), error: null }
    if (name === "media_account_exists") return { data: false, error: null }
    return { data: null, error: null }
  })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
const remove = vi.fn()
beforeEach(() => { vi.resetAllMocks(); deletion.mockResolvedValue(true) })

it("congela antes de retirar y verifica la supresión después del último recibo", async () => {
  const { db, rpc } = client([pending, empty])
  deletion.mockImplementation(async () => {
    expect(rpc.mock.calls.map(c => c[0])).toEqual(["begin_media_account_closure", "get_media_account_closure_batch"])
    return true
  })
  expect(await continueAccountClosure(db, "actor", remove)).toEqual({
    eliminada: true, archivosRetirados: 1, archivosPendientes: 0, requiereRevision: false,
  })
  expect(deletion).toHaveBeenCalledWith(db, "audio/uno", remove, "actor")
  expect(rpc.mock.calls.map(c => c[0])).toEqual([
    "begin_media_account_closure", "get_media_account_closure_batch",
    "get_media_account_closure_batch", "eliminar_mi_cuenta", "media_account_exists",
  ])
})
it("un lote de más de mil objetos conserva progreso para la siguiente petición", async () => {
  const keys = Array.from({ length: 25 }, (_, i) => "audio/" + i)
  const { db, rpc } = client([
    { keys, remaining: 1001, total: 1001, blocked: false },
    { keys: ["audio/siguiente"], remaining: 976, total: 1001, blocked: false },
  ])
  expect(await continueAccountClosure(db, "actor", remove)).toMatchObject({
    eliminada: false, archivosRetirados: 25, archivosPendientes: 976,
  })
  expect(deletion).toHaveBeenCalledTimes(25)
  expect(rpc).not.toHaveBeenCalledWith("eliminar_mi_cuenta")
})
it("un histórico sin garantías requiere revisión sin tocar R2 ni borrar Auth", async () => {
  const { db, rpc } = client([{ keys: [], remaining: 1, total: 1, blocked: true }])
  expect(await continueAccountClosure(db, "actor", remove)).toMatchObject({ eliminada: false, requiereRevision: true })
  expect(deletion).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalledWith("eliminar_mi_cuenta")
})
it("un fallo parcial de R2 conserva la cuenta para reintentar", async () => {
  const { db, rpc } = client([{ ...pending, keys: ["audio/uno", "audio/dos"], remaining: 2, total: 2 }])
  deletion.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("fallo"))
  await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalledWith("eliminar_mi_cuenta")
})
it("un reintento sólo procesa las claves que la base mantiene pendientes", async () => {
  const { db } = client([{ ...pending, keys: ["audio/dos"], total: 2 }, { ...empty, total: 2 }])
  expect(await continueAccountClosure(db, "actor", remove)).toMatchObject({ eliminada: true, archivosRetirados: 2 })
  expect(deletion).toHaveBeenCalledTimes(1)
  expect(deletion).toHaveBeenCalledWith(db, "audio/dos", remove, "actor")
})
it("una reclamación rechazada no permite finalizar", async () => {
  const { db, rpc } = client([pending])
  deletion.mockResolvedValue(false)
  await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalledWith("eliminar_mi_cuenta")
})
it.each([null, false])("exige confirmación explícita de congelación (%s)", async data => {
  const { db, rpc } = client([], { begin_media_account_closure: { data, error: null } })
  await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(deletion).not.toHaveBeenCalled()
})
it.each([null, { ...empty, remaining: -1 }, { ...pending, keys: [] }, { ...pending, keys: [12] }])(
  "no procesa un inventario inválido (%j)", async data => {
    const { db, rpc } = client([data])
    await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
    expect(deletion).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("eliminar_mi_cuenta")
  },
)
it("no declara éxito si el borrado SQL falla", async () => {
  const { db, rpc } = client([empty, empty], { eliminar_mi_cuenta: { error: {} } })
  await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalledWith("media_account_exists")
})
it("no declara éxito mientras la cuenta todavía exista", async () => {
  const { db } = client([empty, empty], { media_account_exists: { data: true, error: null } })
  await expect(continueAccountClosure(db, "actor", remove)).rejects.toThrow()
})

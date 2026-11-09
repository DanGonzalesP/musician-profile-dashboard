import { describe, it, expect, vi } from "vitest"
import { checkAuthenticatedRateLimit } from "./rate-limit"
import type { SupabaseClient } from "@supabase/supabase-js"

// Fabrica un cliente de Supabase falso cuyo .rpc() devuelve lo que se le diga.
function fakeSupabase(rpcResult: { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as unknown as SupabaseClient
}

describe("checkAuthenticatedRateLimit — contador compartido en Postgres", () => {
  it("mapea una fila permitida", async () => {
    const cliente = fakeSupabase({ data: [{ is_allowed: true, retry_after: 0 }], error: null })
    const r = await checkAuthenticatedRateLimit(cliente, "upload")
    expect(r).toEqual({ permitido: true, restantes: 0, reintentarEn: 0 })
    expect(cliente.rpc).toHaveBeenCalledWith("consume_authenticated_rate_limit", { p_bucket: "upload" })
  })

  it("mapea una fila bloqueada con su retry_after (redondeado hacia arriba)", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: [{ is_allowed: false, retry_after: 29 }], error: null }), "upload")
    expect(r).toEqual({ permitido: false, restantes: 0, reintentarEn: 29 })
  })

  it("acepta la fila como objeto suelto además de como arreglo", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: { is_allowed: true, retry_after: 0 }, error: null }), "upload")
    expect(r?.permitido).toBe(true)
  })

  it("bloquea si la migración no existe", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: null, error: { code: "PGRST202" } }), "upload")
    expect(r).toEqual({ permitido: false, restantes: 0, reintentarEn: 60 })
  })

  it("bloquea ante cualquier otro error", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: null, error: { code: "XX000", message: "boom" } }), "upload")
    expect(r).toEqual({ permitido: false, restantes: 0, reintentarEn: 60 })
  })

  it("bloquea si la fila viene malformada", async () => {
    expect(await checkAuthenticatedRateLimit(fakeSupabase({ data: [], error: null }), "upload")).toEqual({
      permitido: false,
      restantes: 0,
      reintentarEn: 60,
    })
    expect(await checkAuthenticatedRateLimit(fakeSupabase({ data: [{ is_allowed: "yes" }], error: null }), "upload")).toEqual({
      permitido: false,
      restantes: 0,
      reintentarEn: 60,
    })
  })
})

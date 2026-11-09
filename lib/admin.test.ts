import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { hasPlatformPermission } from "./admin"

function client(result?: unknown, reject?: boolean) {
  const rpc = vi.fn(() => reject ? Promise.reject(new Error("rpc failed")) : Promise.resolve(result))
  return { supabase: { rpc } as unknown as SupabaseClient, rpc }
}

describe("hasPlatformPermission", () => {
  it("acepta únicamente true sin error y envía el permiso", async () => {
    const { supabase, rpc } = client({ data: true, error: null })
    expect(await hasPlatformPermission(supabase, "maintenance")).toBe(true)
    expect(rpc).toHaveBeenCalledExactlyOnceWith("has_platform_permission", {
      p_permission: "maintenance",
    })
  })

  it.each([
    ["false", { data: false, error: null }],
    ["error", { data: true, error: { message: "denied" } }],
    ["null response", null],
    ["missing error", { data: true }],
    ["nonboolean data", { data: 1, error: null }],
  ])("deniega %s", async (_case, result) => {
    const { supabase } = client(result)
    expect(await hasPlatformPermission(supabase, "moderation")).toBe(false)
  })

  it("deniega si la RPC lanza", async () => {
    const { supabase } = client(undefined, true)
    expect(await hasPlatformPermission(supabase, "roles")).toBe(false)
  })
})

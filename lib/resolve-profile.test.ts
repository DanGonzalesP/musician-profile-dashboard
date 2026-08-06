import { describe, it, expect, vi, beforeEach } from "vitest"

// Resolución de username → perfil, con Supabase mockeado. Cubre el caso límite
// de "perfil inexistente" (debe dar null, no lanzar) y el redirect por username
// antiguo, sin tocar la red.

type Row = Record<string, unknown> | null
// Resultado por tabla y por valor buscado en .eq(campo, valor).
const results: Record<string, Record<string, { data: Row; error?: unknown }>> = {
  profiles: {},
  username_history: {},
}

function builder(table: string) {
  let column = ""
  let value = ""
  const chain = {
    select: () => chain,
    eq: (_col: string, val: string) => {
      column = _col
      value = val
      return chain
    },
    maybeSingle: async () => {
      void column
      return results[table]?.[value] ?? { data: null }
    },
  }
  return chain
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => builder(table) },
}))

import { resolveProfileByUsername } from "./username"

beforeEach(() => {
  results.profiles = {}
  results.username_history = {}
})

describe("resolveProfileByUsername — caso límite de perfil inexistente", () => {
  it("devuelve null para un username inválido sin consultar la base", async () => {
    expect(await resolveProfileByUsername("no válido!")).toBeNull()
    expect(await resolveProfileByUsername("ab")).toBeNull()
  })

  it("devuelve null cuando no existe ni el perfil ni un historial", async () => {
    expect(await resolveProfileByUsername("fantasma")).toBeNull()
  })

  it("devuelve el perfil cuando existe", async () => {
    results.profiles["nova_reyes"] = {
      data: { id: "p1", username: "nova_reyes", display_name: "Nova Reyes", profile_type: "artist", unified_profile: false },
    }
    const r = await resolveProfileByUsername("Nova_Reyes") // se normaliza a minúsculas
    expect(r).toMatchObject({ id: "p1", username: "nova_reyes", displayName: "Nova Reyes" })
    expect(r?.redirectTo).toBeUndefined()
  })

  it("redirige desde un username antiguo al actual", async () => {
    results.username_history["nova_vieja"] = { data: { profile_id: "p1" } }
    results.profiles["p1"] = {
      data: { id: "p1", username: "nova_reyes", display_name: "Nova", profile_type: "artist", unified_profile: true },
    }
    const r = await resolveProfileByUsername("nova_vieja")
    expect(r?.username).toBe("nova_reyes")
    expect(r?.redirectTo).toBe("nova_reyes")
  })

  it("propaga un error real de la base en vez de tragárselo", async () => {
    results.profiles["explota"] = { data: null, error: new Error("db down") }
    await expect(resolveProfileByUsername("explota")).rejects.toThrow("db down")
  })
})

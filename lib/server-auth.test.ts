import { describe, it, expect, vi, beforeEach } from "vitest"

// Se mockea el SDK de Supabase para no tocar la red: estas pruebas fijan cómo
// las rutas de API deciden si hay sesión válida a partir del header
// Authorization, incluido el caso "sin sesión" (que debe dar null, nunca un
// usuario a medias).

const getUser = vi.fn()
const createClient = vi.fn((..._args: unknown[]) => ({ auth: { getUser } }))

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

import { getAuthenticatedUser, getAuthenticatedContext } from "./server-auth"

const withAuth = (token?: string) =>
  new Request("https://x/api", { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => {
  getUser.mockReset()
  createClient.mockClear()
})

describe("getAuthenticatedUser", () => {
  it("devuelve null sin header Authorization, sin siquiera crear el cliente", async () => {
    expect(await getAuthenticatedUser(withAuth())).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it("devuelve null si el header no es un Bearer", async () => {
    const req = new Request("https://x/api", { headers: { authorization: "Basic abc" } })
    expect(await getAuthenticatedUser(req)).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it("devuelve el id cuando el token es válido", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null })
    expect(await getAuthenticatedUser(withAuth("jwt"))).toEqual({ id: "user-123" })
    expect(getUser).toHaveBeenCalledWith("jwt")
  })

  it("devuelve null cuando el token es inválido o expiró", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } })
    expect(await getAuthenticatedUser(withAuth("caducado"))).toBeNull()
  })
})

describe("getAuthenticatedContext", () => {
  it("devuelve null sin token", async () => {
    expect(await getAuthenticatedContext(withAuth())).toBeNull()
  })

  it("devuelve el usuario y adjunta el JWT al cliente (para que RLS lo evalúe)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-9" } }, error: null })
    const ctx = await getAuthenticatedContext(withAuth("jwt-9"))
    expect(ctx?.user).toEqual({ id: "user-9" })
    expect(ctx?.supabase).toBeTruthy()

    // El cliente se crea con el header Authorization del usuario: así
    // auth.uid() no es null dentro de las políticas de RLS.
    const opts = (createClient.mock.calls.at(-1)?.[2] ?? {}) as { global?: { headers?: Record<string, string> } }
    expect(opts?.global?.headers?.Authorization).toBe("Bearer jwt-9")
  })

  it("devuelve null si el token no valida", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } })
    expect(await getAuthenticatedContext(withAuth("malo"))).toBeNull()
  })
})

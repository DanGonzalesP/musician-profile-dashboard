import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ user: true, role: "owner", error: false, tag: vi.fn(), path: vi.fn(), rpc: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }))
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))
vi.mock("@/lib/supabase-server", () => ({ etiquetaPerfil: (value: string) => `perfil:${value}` }))
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user ? { id: "usuario" } : null } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "perfil" }, error: null }) }) }) }),
  rpc: mocks.rpc,
}) }))
import { revalidarPerfilPublico } from "./revalidar-perfil"
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = true; mocks.role = "owner"; mocks.error = false
  mocks.rpc.mockImplementation(async () => ({ data: mocks.role, error: mocks.error ? {} : null }))
})
it("invalida datos y rutas sólo para el gestor del perfil", async () => {
  await revalidarPerfilPublico(" Artista ")
  expect(mocks.rpc).toHaveBeenCalledWith("get_profile_role", { target_profile_id: "perfil" })
  expect(mocks.tag).toHaveBeenCalledWith("perfil:artista", { expire: 0 })
  expect(mocks.path.mock.calls).toEqual([["/artista"], ["/artista/tienda"]])
})
it("una sesión ajena no basta para invalidar", async () => {
  mocks.role = "member"
  await revalidarPerfilPublico("artista")
  expect(mocks.tag).not.toHaveBeenCalled()
})
it("sesión vencida y fallo de la RPC cierran la operación", async () => {
  mocks.user = false
  await revalidarPerfilPublico("artista")
  mocks.user = true; mocks.error = true
  await revalidarPerfilPublico("artista")
  expect(mocks.tag).not.toHaveBeenCalled()
})
it("entrada no textual o rutas manipuladas no llegan a Postgres", async () => {
  await revalidarPerfilPublico(42 as unknown as string)
  await revalidarPerfilPublico("../otra")
  expect(mocks.rpc).not.toHaveBeenCalled()
})

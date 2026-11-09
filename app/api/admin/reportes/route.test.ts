import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), permission: vi.fn(), rpc: vi.fn(), tag: vi.fn(), path: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getAuthenticatedContext: mocks.auth }))
vi.mock("@/lib/admin", () => ({ hasPlatformPermission: mocks.permission }))
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))
vi.mock("@/lib/supabase-server", () => ({ etiquetaPerfil: (name: string) => `perfil:${name}` }))
import { GET, POST } from "./route"
const body = { reportId: "12345678-1234-4123-8123-123456789012", version: 1, action: "suspend", note: "Decisión ficticia de revisión" }
// Confirmación completa de la base: estado esperado, versión siguiente y perfil.
const confirmed = { username: "artista", status: "aceptado", version: 2, profileId: "22345678-1234-4123-8123-123456789012" }
const request = (value: unknown = body) => new Request("https://example.test/api/admin/reportes", { method: "POST", body: JSON.stringify(value) })
beforeEach(() => {
 vi.resetAllMocks()
 mocks.auth.mockResolvedValue({ user: { id: "moderator" }, supabase: { rpc: mocks.rpc } })
 mocks.permission.mockResolvedValue(true)
})
it("sin sesión ni permiso no consulta ni cambia datos", async () => {
 mocks.auth.mockResolvedValue(null)
 expect((await GET(new Request("https://example.test/api/admin/reportes"))).status).toBe(403)
 expect((await POST(request())).status).toBe(403)
 mocks.auth.mockResolvedValue({ supabase: { rpc: mocks.rpc } }); mocks.permission.mockResolvedValue(false)
 expect((await POST(request())).status).toBe(403)
 expect(mocks.rpc).not.toHaveBeenCalled()
})
it("rechaza una decisión sin nota antes de la RPC", async () => {
 expect((await POST(request({ ...body, note: "corta" }))).status).toBe(400)
 expect(mocks.rpc).not.toHaveBeenCalled()
})
it("una versión obsoleta no invalida cachés ni filtra errores", async () => {
 mocks.rpc.mockResolvedValue({ error: { code: "PT409", message: "private-table-internal" } })
 const response = await POST(request())
 expect(response.status).toBe(409)
 expect(await response.text()).not.toContain("private-table-internal")
 expect(mocks.tag).not.toHaveBeenCalled()
})
it("la decisión confirmada invalida perfil, tienda, feed y sitemap", async () => {
 mocks.rpc.mockResolvedValue({ data: confirmed, error: null })
 expect(await (await POST(request())).json()).toEqual({ saved: true, cacheUpdated: true })
 expect(mocks.rpc).toHaveBeenCalledWith("moderate_report", { p_report_id: body.reportId, p_expected_version: 1, p_action: "suspend", p_note: body.note })
 expect(mocks.tag).toHaveBeenCalledWith("perfil:artista", { expire: 0 })
 for (const path of ["/artista", "/artista/tienda", "/", "/sitemap.xml"]) expect(mocks.path).toHaveBeenCalledWith(path)
})
it("sin confirmación completa de la base no da la decisión por guardada ni invalida cachés", async () => {
 for (const data of [{ username: "artista" }, { ...confirmed, version: 1 }, { ...confirmed, status: "rechazado" }, { ...confirmed, profileId: "x" }]) {
  mocks.rpc.mockResolvedValue({ data, error: null })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).not.toHaveProperty("saved")
 }
 expect(mocks.tag).not.toHaveBeenCalled()
 expect(mocks.path).not.toHaveBeenCalled()
})
it("un fallo posterior de caché conserva la confirmación de la decisión", async () => {
 mocks.rpc.mockResolvedValue({ data: confirmed, error: null })
 mocks.tag.mockImplementation(() => { throw new Error("cache offline") })
 expect(await (await POST(request())).json()).toEqual({ saved: true, cacheUpdated: false })
 expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it("la cola y el historial tienen respuestas privadas", async () => {
 mocks.rpc.mockResolvedValue({ data: [], error: null })
 const response = await GET(new Request("https://example.test/api/admin/reportes?status=en_revision&offset=50"))
 expect(response.headers.get("cache-control")).toBe("no-store")
 expect(mocks.rpc).toHaveBeenCalledWith("moderation_queue", { p_status: "en_revision", p_offset: 50 })
 expect((await GET(new Request("https://example.test/api/admin/reportes?offset=-1"))).status).toBe(400)
})

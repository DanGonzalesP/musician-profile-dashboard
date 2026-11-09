import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditorPersistence, readEditorState } from "./editor-persistence"
import { fetchDraft } from "./draft"
import { sanitizeUrlFields } from "./safe-url"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn(), getSession: vi.fn(), headers: [] as string[] }))
// rpc() devuelve un builder: la petición sale al fijar el JWT o al esperarlo.
vi.mock("./supabase", () => ({ supabase: {
  auth: { getSession: mocks.getSession },
  rpc: (...args: unknown[]) => ({
    setHeader: (_name: string, value: string) => { mocks.headers.push(value); return mocks.rpc(...args) },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(mocks.rpc(...args)).then(resolve, reject),
  }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
} }))
const OWNER = "usuario-propietario"
const sessionOf = (id: string) => ({ data: { session: { user: { id }, access_token: `jwt-${id}` } }, error: null })
const initial = { content_version: 0, draft_revision: 0, draft_content: null }
const draft = { blocks: [{ id: "hero", type: "hero", data: {} }], products: [], services: [] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.headers.length = 0
  mocks.getSession.mockResolvedValue(sessionOf(OWNER))
})
describe("persistencia del editor", () => {
  it("guarda y publica el teléfono de contacto sin perderlo", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: { content_version: 1, draft_revision: 2 }, error: null })
    const contactUrl = "+51 (999) 888-777"
    const content = { contactUrl }
    const editor = new EditorPersistence("p", initial, OWNER)
    await editor.save({ ...draft, blocks: [{ id: "hero", type: "hero", data: content }] })
    await editor.publish([{ block_type: "hero", position_index: 0, content: sanitizeUrlFields(content) }], [], [])
    expect(mocks.rpc.mock.calls[0][1].p_draft.blocks[0].data.contactUrl).toBe(contactUrl)
    expect(mocks.rpc.mock.calls[1][1].p_blocks[0].content.contactUrl).toBe(contactUrl)
  })

  it("una lectura fallida nunca se interpreta como borrador vacío", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "falló la red" } })
    await expect(fetchDraft("p")).rejects.toThrow("No se pudo leer")
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "503" } })
    await expect(readEditorState("p")).rejects.toThrow("No se pudo cargar")
  })
  it("espera el autoguardado pendiente antes de publicar y usa su revisión", async () => {
    let finish!: (v: unknown) => void
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce({ data: { content_version: 1, draft_revision: 2 }, error: null })
    const editor = new EditorPersistence("p", initial, OWNER)
    const saving = editor.save(draft)
    const publishing = editor.publish([], [], [])
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    finish({ data: 1, error: null })
    await Promise.all([saving, publishing])
    expect(mocks.rpc.mock.calls[1][0]).toBe("publish_profile_complete")
    expect(mocks.rpc.mock.calls[1][1].p_expected_revision).toBe(1)
  })
  it("serializa dos autoguardados usando revisiones consecutivas", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null }).mockResolvedValueOnce({ data: 2, error: null })
    const editor = new EditorPersistence("p", initial, OWNER)
    await Promise.all([editor.save(draft), editor.save(draft)])
    expect(mocks.rpc.mock.calls.map(c => c[1].p_expected_revision)).toEqual([0, 1])
  })
  it("una sesión perdida bloquea los guardados en cola sin inventar una versión", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "401", message: "detalle interno" } })
    const editor = new EditorPersistence("p", initial, OWNER)
    const results = await Promise.allSettled([editor.save(draft), editor.publish([], [], [])])
    expect(results.every(r => r.status === "rejected")).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(results)).not.toContain("detalle interno")
  })
  it("cada escritura lleva el JWT de la cuenta que abrió el editor", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null })
    await new EditorPersistence("p", initial, OWNER).save(draft)
    expect(mocks.headers).toEqual([`Bearer jwt-${OWNER}`])
  })
  it("si la sesión pasa a otra cuenta, no escribe con ella y bloquea la cola", async () => {
    mocks.getSession.mockResolvedValue(sessionOf("otra-cuenta"))
    const editor = new EditorPersistence("p", initial, OWNER)
    await expect(editor.save(draft)).rejects.toThrow("La cuenta cambió")
    mocks.getSession.mockResolvedValue(sessionOf(OWNER))
    await expect(editor.save(draft)).rejects.toThrow("La cuenta cambió")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rechaza un borrador inválido antes de escribir", async () => {
    await expect(new EditorPersistence("p", initial, OWNER).save({ blocks: [{ type: "desconocido" }] })).rejects.toThrow("formato inválido")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

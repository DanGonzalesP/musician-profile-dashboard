import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), responses: new Map<string, unknown>(), headers: [] as string[] }))
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getSession: mocks.getSession },
  rpc: (name: string) => {
    const builder = {
      setHeader: (_header: string, value: string) => { mocks.headers.push(`${name}:${value}`); return builder },
      abortSignal: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.responses.get(name)).then(resolve),
    }
    return builder
  },
} }))
import { EXPORT_DATA_CATEGORIES, exportarMisDatos } from "./moderation"

const OWNER = "00000000-0000-4000-8000-000000000001"
const copia = { version_formato: 6, ...Object.fromEntries(EXPORT_DATA_CATEGORIES.map(([key]) => [key, []])) }
const constancia = { terms_version: "2026-11-09", privacy_version: "2026-11-09", age_assurance: "adult_self_declared", accepted_at: "2026-11-09T10:00:00Z" }

beforeEach(() => {
  mocks.headers.length = 0
  mocks.responses.clear()
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: "jwt" } }, error: null })
  mocks.responses.set("exportar_mis_datos", { data: copia, error: null })
})

it("incluye las constancias legales con la misma sesión", async () => {
  mocks.responses.set("read_my_legal_acceptances", { data: [constancia], error: null })
  const datos = await exportarMisDatos(OWNER)
  expect(datos.constancias_legales).toEqual([constancia])
  expect(mocks.headers).toEqual(["exportar_mis_datos:Bearer jwt", "read_my_legal_acceptances:Bearer jwt"])
})

it("una base sin 0071 lo indica en la copia en vez de omitirlo en silencio", async () => {
  mocks.responses.set("read_my_legal_acceptances", { data: null, error: { code: "PGRST202" } })
  const datos = await exportarMisDatos(OWNER)
  expect(datos.constancias_legales).toBeNull()
  expect(datos.constancias_legales_estado).toBe("no_disponible_en_esta_version")
})

it("otro fallo al leer constancias invalida la exportación", async () => {
  mocks.responses.set("read_my_legal_acceptances", { data: null, error: { code: "500", message: "interno" } })
  await expect(exportarMisDatos(OWNER)).rejects.toThrow("No se pudo preparar la copia")
})

it("no exporta si la sesión pertenece a otra cuenta", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "otra" }, access_token: "x" } }, error: null })
  await expect(exportarMisDatos(OWNER)).rejects.toThrow("La sesión cambió")
  expect(mocks.headers).toEqual([])
})

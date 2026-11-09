import { afterAll, describe, expect, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { clienteAdministrativo, clienteAnonimo, exigirEntornoLocal, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"
import { exigirBaseDeVibe } from "./identidad-de-la-base"

// 0071: la constancia nace sólo del alta y es la condición para crear perfil.
const VALIDA = { terms_version: "2026-11-09", privacy_version: "2026-11-09", age_assurance: "adult_self_declared" }
const creados: UsuarioDePrueba[] = []
let contador = 0

async function registrar(vibeLegal: unknown): Promise<UsuarioDePrueba> {
  const { url, anonKey } = exigirEntornoLocal()
  await exigirBaseDeVibe(clienteAdministrativo(), url)
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `legal-${Date.now()}-${contador++}@ejemplo.local`
  const password = `Prueba-${Math.random().toString(36).slice(2)}-9!`
  const options = vibeLegal === undefined ? {} : { data: { vibe_legal: vibeLegal } }
  const { data, error } = await client.auth.signUp({ email, password, options })
  if (error || !data.user || !data.session) throw new Error(`Alta de prueba fallida: ${error?.message}`)
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  })
  const usuario = { id: data.user.id, email, supabase, auth: client.auth }
  creados.push(usuario)
  return usuario
}

const crearPerfil = (usuario: UsuarioDePrueba) => usuario.supabase.from("profiles")
  .insert({ user_id: usuario.id, display_name: "Artista ficticio", username: `l${usuario.id.replace(/-/g, "").slice(0, 20)}` })
  .select("id").single()

afterAll(async () => { await limpiarUsuarios(...creados) })

describe("aceptación legal y declaración de edad (0071)", () => {
  it("el alta con declaración válida deja constancia propia y permite crear el perfil", async () => {
    const usuario = await registrar(VALIDA)
    const constancias = await usuario.supabase.rpc("read_my_legal_acceptances")
    expect(constancias.error).toBeNull()
    expect(constancias.data).toHaveLength(1)
    expect(constancias.data?.[0]).toMatchObject(VALIDA)
    const perfil = await crearPerfil(usuario)
    expect(perfil.error).toBeNull()
  })

  it("sin declaración no hay constancia y la base rechaza crear el perfil", async () => {
    const usuario = await registrar(undefined)
    expect((await usuario.supabase.rpc("read_my_legal_acceptances")).data).toEqual([])
    const perfil = await crearPerfil(usuario)
    expect(perfil.error?.code).toBe("42501")
    expect(perfil.error?.message).toContain("aceptacion_legal_requerida")
  })

  it("una declaración de menor o malformada no se registra", async () => {
    for (const declaracion of [{ ...VALIDA, age_assurance: "minor" }, { ...VALIDA, terms_version: "ayer" }, "si"]) {
      const usuario = await registrar(declaracion)
      expect((await usuario.supabase.rpc("read_my_legal_acceptances")).data).toEqual([])
      expect((await crearPerfil(usuario)).error?.code).toBe("42501")
    }
  })

  it("editar los metadatos después del alta no fabrica una constancia", async () => {
    const usuario = await registrar(undefined)
    const editado = await usuario.auth.updateUser({ data: { vibe_legal: VALIDA } })
    expect(editado.error).toBeNull()
    expect((await usuario.supabase.rpc("read_my_legal_acceptances")).data).toEqual([])
    expect((await crearPerfil(usuario)).error?.code).toBe("42501")
  })

  it("cada cuenta sólo lee sus constancias y un visitante no puede consultarlas", async () => {
    const [una, otra] = [await registrar(VALIDA), await registrar(undefined)]
    expect((await una.supabase.rpc("read_my_legal_acceptances")).data).toHaveLength(1)
    expect((await otra.supabase.rpc("read_my_legal_acceptances")).data).toEqual([])
    const anonimo = await clienteAnonimo().rpc("read_my_legal_acceptances")
    expect(anonimo.error).toBeTruthy()
    const directa = await una.supabase.schema("private" as never).from("legal_acceptances").select("*")
    expect(directa.error).toBeTruthy()
  })
})

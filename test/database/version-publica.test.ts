import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

describe("versión pública usada por la caché del perfil", () => {
  let artist: UsuarioDePrueba
  beforeAll(async () => { artist = await crearUsuario() })
  afterAll(async () => { await limpiarUsuarios(artist) })

  it("un visitante puede leer exactamente la consulta de versión del servidor", async () => {
    const result = await clienteAnonimo().from("profiles")
      .select("id, content_version, is_suspended, username, display_name, bio, profile_type, unified_profile, accent_color")
      .eq("id", artist.profileId!).single()
    expect(result.error).toBeNull()
    expect(result.data?.id).toBe(artist.profileId)
    expect(result.data?.content_version).toBe(0)
  })

  it("el permiso del contador no expone identidad privada ni habilita escritura anónima", async () => {
    const anonymous = clienteAnonimo()
    const privateRead = await anonymous.from("profiles").select("id, user_id").eq("id", artist.profileId!)
    expect(privateRead.error).toBeTruthy()
    const write = await anonymous.from("profiles").update({ content_version: 999 }).eq("id", artist.profileId!).select("id")
    // RLS descarta las filas no autorizadas sin error de PostgREST.
    expect(write.error).toBeNull()
    expect(write.data).toEqual([])
    const current = await artist.supabase.from("profiles").select("content_version").eq("id", artist.profileId!).single()
    expect(current.error).toBeNull()
    expect(current.data?.content_version).toBe(0)
  })
})

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { crearUsuario, clienteAnonimo, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

// Los P0 de AUDITORIA.md sobre perfiles. Cada `it` de aquí debe ponerse EN ROJO
// si se comenta la política correspondiente: esa es la verificación real de
// que la prueba sirve de algo.

describe("RLS · perfiles", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Prueba" })
    beto = await crearUsuario({ nombre: "Beto Prueba" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("profiles — lectura pública, escritura del dueño", () => {
    it("cualquiera lee el perfil público (el feed depende de ello)", async () => {
      const { data, error } = await clienteAnonimo()
        .from("profiles")
        .select("id, display_name")
        .eq("id", ana.profileId!)
        .maybeSingle()

      expect(error).toBeNull()
      expect(data?.display_name).toBe("Ana Prueba")
    })

    it("A NO puede escribir el perfil de B", async () => {
      const { error } = await ana.supabase
        .from("profiles")
        .update({ display_name: "Secuestrado por Ana" })
        .eq("id", beto.profileId!)

      // RLS puede responder con error o con 0 filas afectadas. Lo que importa
      // es que el nombre no cambió.
      const { data } = await clienteAnonimo()
        .from("profiles")
        .select("display_name")
        .eq("id", beto.profileId!)
        .single()

      expect(data?.display_name).toBe("Beto Prueba")
      if (error) expect(error).toBeTruthy()
    })

    it("A NO puede borrar el perfil de B", async () => {
      await ana.supabase.from("profiles").delete().eq("id", beto.profileId!)

      const { data } = await clienteAnonimo().from("profiles").select("id").eq("id", beto.profileId!)
      expect(data).toHaveLength(1)
    })

    it("A sí puede escribir el suyo", async () => {
      const { error } = await ana.supabase
        .from("profiles")
        .update({ display_name: "Ana Renombrada" })
        .eq("id", ana.profileId!)

      expect(error).toBeNull()
      const { data } = await clienteAnonimo()
        .from("profiles")
        .select("display_name")
        .eq("id", ana.profileId!)
        .single()
      expect(data?.display_name).toBe("Ana Renombrada")
    })

    it("un anónimo NO puede insertar un perfil", async () => {
      const { error } = await clienteAnonimo()
        .from("profiles")
        .insert({ display_name: "Perfil fantasma", username: "fantasma" })
      expect(error).toBeTruthy()
    })
  })

  describe("profiles — columnas sensibles (migración 0003)", () => {
    it("`profiles` YA NO tiene legal_settings ni draft_content", async () => {
      // La fuga más grave de la auditoría: el DNI del artista servido por la
      // anon key, que está en el bundle del navegador por diseño.
      for (const columna of ["legal_settings", "draft_content"]) {
        const { error } = await clienteAnonimo().from("profiles").select(columna).limit(1)
        expect(error, `la columna ${columna} sigue existiendo en profiles`).toBeTruthy()
      }
    })

    it("anon NO puede leer user_id ni owner_user_id (correlación con auth.users)", async () => {
      for (const columna of ["user_id", "owner_user_id"]) {
        const { error } = await clienteAnonimo().from("profiles").select(columna).limit(1)
        expect(error, `anon puede leer ${columna}`).toBeTruthy()
      }
    })

    it("anon sí lee las columnas públicas que el perfil y el feed necesitan", async () => {
      const { error } = await clienteAnonimo()
        .from("profiles")
        .select("id, display_name, bio, profile_type, accent_color, musician_roles, created_at")
        .limit(1)
      expect(error).toBeNull()
    })
  })

  describe("profile_private — solo el dueño (migración 0003)", () => {
    beforeAll(async () => {
      const { error } = await ana.supabase.from("profile_private").upsert({
        profile_id: ana.profileId!,
        draft_content: { bloques: ["borrador de Ana"] },
        legal_settings: { dni: "00000000", nombre_legal: "Ana de Prueba" },
      })
      expect(error).toBeNull()
    })

    it("un anónimo no obtiene NINGUNA fila", async () => {
      const { data, error } = await clienteAnonimo().from("profile_private").select("*")
      // O 0 filas, o error. Las dos son aceptables; devolver datos no.
      expect(error ? true : (data ?? []).length === 0).toBe(true)
    })

    it("B NO ve el borrador ni los datos legales de A", async () => {
      const { data } = await beto.supabase
        .from("profile_private")
        .select("*")
        .eq("profile_id", ana.profileId!)
      expect(data ?? []).toHaveLength(0)
    })

    it("B NO puede escribir sobre la fila privada de A", async () => {
      await beto.supabase
        .from("profile_private")
        .update({ legal_settings: { dni: "99999999" } })
        .eq("profile_id", ana.profileId!)

      const { data } = await ana.supabase
        .from("profile_private")
        .select("legal_settings")
        .eq("profile_id", ana.profileId!)
        .single()
      expect((data?.legal_settings as { dni?: string })?.dni).toBe("00000000")
    })

    it("A sí ve lo suyo", async () => {
      const { data, error } = await ana.supabase
        .from("profile_private")
        .select("draft_content, legal_settings")
        .eq("profile_id", ana.profileId!)
        .single()

      expect(error).toBeNull()
      expect(data?.draft_content).toEqual({ bloques: ["borrador de Ana"] })
    })
  })

  describe("username (migración 0006)", () => {
    it("dos perfiles no pueden compartir username", async () => {
      const { data: anaRow } = await ana.supabase
        .from("profiles")
        .select("username")
        .eq("id", ana.profileId!)
        .single()

      const { error } = await beto.supabase
        .from("profiles")
        .update({ username: anaRow?.username })
        .eq("id", beto.profileId!)

      expect(error).toBeTruthy()
    })
  })
})

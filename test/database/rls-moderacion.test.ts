import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  claveDeMedio,
  clienteAdministrativo,
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  mensajeDeError,
  type UsuarioDePrueba,
} from "./helpers"

// Moderación y cumplimiento legal (migración 0008, endurecida por 0013).
//
// Las páginas de /legal prometen procesos —reportar, bloquear, takedown,
// exportar, borrar— que aquí se verifican como conducta, no como documentación:
//
//   • Nadie ve los reportes ajenos: exponer quién reportó a quién invita a
//     represalias.
//   • Un reclamo de derechos de autor sin declaración jurada no es una
//     notificación válida, y la base lo rechaza.
//   • `exportar_mis_datos` y `eliminar_mi_cuenta` operan sobre quien llama y
//     sobre nadie más. Son derechos de la Ley 29733 y del GDPR: una fuga acá es
//     un incidente regulatorio, no un bug.

describe("RLS · moderación y cumplimiento", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  let reporteDeAna: string

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Moderación" })
    beto = await crearUsuario({ nombre: "Beto Moderación" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("content_reports", () => {
    beforeAll(async () => {
      const { data, error } = await ana.supabase
        .from("content_reports")
        .insert({
          reporter_user_id: ana.id,
          reported_profile_id: beto.profileId,
          target_type: "perfil",
          reason: "spam_o_estafa",
          details: "Este perfil publica enlaces de venta falsos.",
        })
        .select("id, status")
        .single()

      expect(error).toBeNull()
      reporteDeAna = data!.id as string
    })

    it("A reporta el perfil de B y ve su propio reporte, en estado pendiente", async () => {
      const { data, error } = await ana.supabase
        .from("content_reports")
        .select("id, status, reported_profile_id")
        .eq("id", reporteDeAna)
        .single()

      expect(error).toBeNull()
      expect(data?.status).toBe("pendiente")
      expect(data?.reported_profile_id).toBe(beto.profileId)
    })

    it("B NO ve el reporte que le hicieron", async () => {
      const { data } = await beto.supabase.from("content_reports").select("*").eq("id", reporteDeAna)
      expect(data ?? []).toHaveLength(0)
    })

    it("un visitante sin sesión no ve NINGÚN reporte", async () => {
      const { data, error } = await clienteAnonimo().from("content_reports").select("*").limit(5)
      expect(error ? true : (data ?? []).length === 0).toBe(true)
    })

    it("A NO puede reportar firmando como B", async () => {
      const { error } = await ana.supabase.from("content_reports").insert({
        reporter_user_id: beto.id,
        reported_profile_id: beto.profileId,
        target_type: "perfil",
        reason: "acoso",
        details: "Reporte atribuido a otra cuenta para provocar represalias.",
      })
      expect(error).toBeTruthy()
    })

    it("el reclamo de derechos de autor sin declaración jurada es rechazado", async () => {
      const reclamo = {
        reporter_user_id: ana.id,
        reported_profile_id: beto.profileId,
        target_type: "pista" as const,
        reason: "derechos_de_autor" as const,
        details: "Esta grabación usa mi obra sin autorización.",
      }

      const { error: sinDeclaracion } = await ana.supabase
        .from("content_reports")
        .insert({ ...reclamo, copyright_sworn_statement: false })
      expect(sinDeclaracion).toBeTruthy()

      const { error: conDeclaracion } = await ana.supabase
        .from("content_reports")
        .insert({ ...reclamo, copyright_sworn_statement: true })
      expect(conDeclaracion).toBeNull()
    })

    it("nadie resuelve su propio reporte", async () => {
      // No hay política de UPDATE: el estado lo mueve la moderación, no el
      // denunciante.
      await ana.supabase
        .from("content_reports")
        .update({ status: "aceptado", moderator_notes: "Me lo acepto solo" })
        .eq("id", reporteDeAna)

      const { data } = await ana.supabase
        .from("content_reports")
        .select("status, moderator_notes")
        .eq("id", reporteDeAna)
        .single()
      expect(data?.status).toBe("pendiente")
      expect(data?.moderator_notes).toBeNull()
    })

    it("un titular de derechos sin cuenta puede reportar, pero no leer nada", async () => {
      // Se admite a propósito: el titular de los derechos de una obra casi nunca
      // es usuario de Vibe. El correo va único por corrida para no consumir el
      // cupo anónimo compartido de la migración 0011.
      const anon = clienteAnonimo()

      const { error } = await anon.from("content_reports").insert({
        reporter_user_id: null,
        reporter_email: `titular-${crypto.randomUUID()}@ejemplo.local`,
        reported_profile_id: beto.profileId,
        target_type: "pista",
        reason: "derechos_de_autor",
        details: "Soy el titular de esta obra y no autoricé su publicación.",
        copyright_sworn_statement: true,
      })
      expect(error).toBeNull()

      const { data, error: errorLectura } = await anon.from("content_reports").select("*").limit(5)
      expect(errorLectura ? true : (data ?? []).length === 0).toBe(true)
    })
  })

  describe("exportar_mis_datos — sólo lo propio", () => {
    beforeAll(async () => {
      await ana.supabase.from("profile_private").upsert({
        profile_id: ana.profileId!,
        legal_settings: { dni: "00000000", nombre_legal: "Ana de Prueba" },
      })
      await ana.supabase.from("profile_blocks").insert({
        profile_id: ana.profileId,
        block_type: "hero",
        position_index: 0,
        content: { titulo: "Bloque de Ana" },
      })
      await ana.supabase
        .from("media_assets")
        .insert({ key: claveDeMedio(), owner_user_id: ana.id, profile_id: ana.profileId, folder: "images" })

      await beto.supabase.from("profile_private").upsert({
        profile_id: beto.profileId!,
        legal_settings: { dni: "11111111", nombre_legal: "Beto de Prueba" },
      })
      await beto.supabase.from("profile_blocks").insert({
        profile_id: beto.profileId,
        block_type: "hero",
        position_index: 0,
        content: { titulo: "Bloque de Beto" },
      })
    })

    it("A recibe sus perfiles, sus datos privados, sus bloques y sus archivos", async () => {
      const { data, error } = await ana.supabase.rpc("exportar_mis_datos")
      expect(error).toBeNull()

      const exportado = data as {
        perfiles: { id: string }[]
        datos_privados: { profile_id: string; legal_settings: { dni?: string } }[]
        bloques: { profile_id: string }[]
        archivos: { owner_user_id: string }[]
      }

      expect(exportado.perfiles.map((p) => p.id)).toEqual([ana.profileId])
      expect(exportado.datos_privados.map((p) => p.profile_id)).toEqual([ana.profileId])
      expect(exportado.datos_privados[0]?.legal_settings?.dni).toBe("00000000")
      expect(exportado.bloques.every((b) => b.profile_id === ana.profileId)).toBe(true)
      expect(exportado.archivos.every((m) => m.owner_user_id === ana.id)).toBe(true)
      expect(exportado.archivos.length).toBeGreaterThan(0)
    })

    it("la exportación de A no contiene NADA de B", async () => {
      const { data } = await ana.supabase.rpc("exportar_mis_datos")
      const serializado = JSON.stringify(data)

      expect(serializado).not.toContain(beto.profileId!)
      expect(serializado).not.toContain(beto.id)
      expect(serializado).not.toContain("11111111")
      expect(serializado).not.toContain("Bloque de Beto")
    })

    it("un visitante sin sesión no puede exportar nada", async () => {
      const { error } = await clienteAnonimo().rpc("exportar_mis_datos")
      expect(error).toBeTruthy()
    })
  })

  describe("eliminar_mi_cuenta — sólo la cuenta que llama", () => {
    it("no acepta un objetivo: no hay forma de apuntarla a otra cuenta", async () => {
      const { error } = await ana.supabase.rpc("eliminar_mi_cuenta", { p_user_id: beto.id })
      expect(error).toBeTruthy()

      const { data } = await clienteAnonimo().from("profiles").select("id").eq("id", beto.profileId!)
      expect(data ?? []).toHaveLength(1)
    })

    it("un visitante sin sesión no puede invocarla", async () => {
      const { error } = await clienteAnonimo().rpc("eliminar_mi_cuenta")
      expect(error).toBeTruthy()
    })

    it("borra el perfil de quien la llama y deja intactos los demás", async () => {
      // Usuario propio para que la prueba no dependa del orden de ejecución.
      const carla = await crearUsuario({ nombre: "Carla Moderación" })

      const { error } = await carla.supabase.rpc("eliminar_mi_cuenta")
      expect(error).toBeNull()

      const { data } = await clienteAnonimo()
        .from("profiles")
        .select("id")
        .in("id", [carla.profileId!, ana.profileId!])
      expect((data ?? []).map((f) => f.id)).toEqual([ana.profileId])

      await limpiarUsuarios(carla)
    })
  })

  describe("suspensión — el takedown saca el contenido de la vista pública", () => {
    let suspendido: UsuarioDePrueba

    beforeAll(async () => {
      suspendido = await crearUsuario({ nombre: "Perfil Suspendido" })
      await suspendido.supabase.from("profile_blocks").insert({
        profile_id: suspendido.profileId,
        block_type: "hero",
        position_index: 0,
        content: { titulo: "Contenido reportado" },
      })

      // El perfil de control se monta acá también para que este bloque no
      // dependa de lo que hayan dejado las pruebas anteriores.
      await ana.supabase.from("profile_blocks").insert({
        profile_id: ana.profileId,
        block_type: "hero",
        position_index: 1,
        content: { titulo: "Perfil de control, no suspendido" },
      })

      // La suspensión es una acción de moderación: la ejecuta el backoffice con
      // la service role, tal como describe docs/runbooks/takedown-dmca.md. Se
      // usa aquí sólo para montar el escenario; toda aserción de abajo se hace
      // con el cliente anónimo o con el JWT del usuario.
      const { error } = await clienteAdministrativo()
        .from("profiles")
        .update({ is_suspended: true, suspended_reason: "takedown de prueba", suspended_at: new Date().toISOString() })
        .eq("id", suspendido.profileId!)
      expect(error).toBeNull()
    })

    afterAll(async () => {
      await limpiarUsuarios(suspendido)
    })

    it("los bloques de un perfil suspendido dejan de verse sin sesión", async () => {
      const { data } = await clienteAnonimo()
        .from("profile_blocks")
        .select("id")
        .eq("profile_id", suspendido.profileId!)
      expect(data ?? []).toHaveLength(0)
    })

    it("tampoco los ve otro usuario con sesión", async () => {
      const { data } = await ana.supabase
        .from("profile_blocks")
        .select("id")
        .eq("profile_id", suspendido.profileId!)
      expect(data ?? []).toHaveLength(0)
    })

    it("la suspensión no afecta a los demás perfiles", async () => {
      const { data } = await clienteAnonimo()
        .from("profile_blocks")
        .select("id")
        .eq("profile_id", ana.profileId!)
      expect((data ?? []).length).toBeGreaterThan(0)
    })

    // ─── Las tres columnas administrativas (migración 0018) ────────────────
    //
    // `profiles_update_owner` autoriza el UPDATE de la fila ENTERA y RLS no
    // distingue columnas: sin el trigger de 0018, un perfil suspendido mandaba
    // `is_suspended = false` por PostgREST y anulaba su propio takedown.
    //
    // Se comprueba columna por columna porque cada una sostiene una parte
    // distinta del expediente: la visibilidad, el motivo que se le comunica al
    // titular de derechos, y la fecha desde la que corre el plazo legal.

    /**
     * Estado completo de la suspensión, leído con el JWT del propio dueño.
     *
     * No se lee con el cliente anónimo a propósito: `anon` tiene concedida la
     * columna `is_suspended` (0008) pero **no** `suspended_reason` ni
     * `suspended_at`, que son el expediente interno del takedown. Pedirlas sin
     * sesión devuelve `42501`. Que el dueño sí las vea es correcto —le toca
     * saber por qué lo suspendieron— y es justo el sujeto que estas pruebas
     * intentan que las manipule.
     */
    async function suspensionDe(usuario: UsuarioDePrueba) {
      const { data, error } = await usuario.supabase
        .from("profiles")
        .select("is_suspended, suspended_reason, suspended_at")
        .eq("id", usuario.profileId!)
        .single()
      expect(error, mensajeDeError(error)).toBeNull()
      return data as { is_suspended: boolean; suspended_reason: string | null; suspended_at: string | null }
    }

    /** Lo único que el mundo ve de la suspensión. */
    async function suspendidoEnPublico(profileId: string) {
      const { data, error } = await clienteAnonimo()
        .from("profiles")
        .select("is_suspended")
        .eq("id", profileId)
        .single()
      expect(error, mensajeDeError(error)).toBeNull()
      return data?.is_suspended as boolean
    }

    it("un perfil suspendido no puede levantarse la suspensión a sí mismo", async () => {
      const { error } = await suspendido.supabase
        .from("profiles")
        .update({ is_suspended: false })
        .eq("id", suspendido.profileId!)

      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("suspension_administrativa")
      expect((await suspensionDe(suspendido)).is_suspended).toBe(true)
      expect(await suspendidoEnPublico(suspendido.profileId!)).toBe(true)

      // Y lo que de verdad importa: su contenido sigue fuera de la vista pública.
      const { data } = await clienteAnonimo()
        .from("profile_blocks")
        .select("id")
        .eq("profile_id", suspendido.profileId!)
      expect(data ?? []).toHaveLength(0)
    })

    it("tampoco puede reescribir el motivo de la suspensión", async () => {
      const antes = await suspensionDe(suspendido)

      const { error } = await suspendido.supabase
        .from("profiles")
        .update({ suspended_reason: "no pasó nada, todo en orden" })
        .eq("id", suspendido.profileId!)

      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("suspension_administrativa")
      expect((await suspensionDe(suspendido)).suspended_reason).toBe(antes.suspended_reason)
    })

    it("tampoco puede mover la fecha desde la que corre el plazo", async () => {
      const antes = await suspensionDe(suspendido)

      const { error } = await suspendido.supabase
        .from("profiles")
        .update({ suspended_at: new Date("2000-01-01T00:00:00.000Z").toISOString() })
        .eq("id", suspendido.profileId!)

      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("suspension_administrativa")
      expect((await suspensionDe(suspendido)).suspended_at).toBe(antes.suspended_at)
    })

    it("tampoco lo consigue borrando las tres columnas de una vez", async () => {
      const { error } = await suspendido.supabase
        .from("profiles")
        .update({ is_suspended: false, suspended_reason: null, suspended_at: null })
        .eq("id", suspendido.profileId!)

      expect(error).toBeTruthy()
      expect((await suspensionDe(suspendido)).is_suspended).toBe(true)
    })

    it("un perfil sano tampoco se suspende a sí mismo: la columna no es suya", async () => {
      const { error } = await ana.supabase
        .from("profiles")
        .update({ is_suspended: true, suspended_reason: "autosuspensión" })
        .eq("id", ana.profileId!)

      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("suspension_administrativa")
      expect((await suspensionDe(ana)).is_suspended).toBe(false)
    })

    it("el resto del perfil se sigue editando con normalidad, incluso suspendido", async () => {
      // El trigger es quirúrgico: si rozara cualquier otra columna, habría
      // cambiado la UX del editor, que es justo lo que no puede pasar.
      const { error } = await suspendido.supabase
        .from("profiles")
        .update({ display_name: "Nombre editado durante la suspensión", bio: "Bio nueva" })
        .eq("id", suspendido.profileId!)
      expect(error, mensajeDeError(error)).toBeNull()

      const { data } = await clienteAnonimo()
        .from("profiles")
        .select("display_name, bio")
        .eq("id", suspendido.profileId!)
        .single()
      expect(data?.display_name).toBe("Nombre editado durante la suspensión")

      // Y publicar —que actualiza content_version en la misma fila— tampoco
      // se ve afectado.
      const { error: errorPublicar } = await suspendido.supabase.rpc("publish_profile", {
        p_profile_id: suspendido.profileId,
        p_blocks: [{ block_type: "hero", position_index: 0, content: { titulo: "Sigue publicando" } }],
        p_expected_version: null,
      })
      expect(errorPublicar, mensajeDeError(errorPublicar)).toBeNull()
    })

    it("la moderación sí puede restaurar el perfil desde un contexto administrativo", async () => {
      // Va al final del bloque a propósito: levanta la suspensión de verdad.
      // El contexto administrativo NO es la aplicación —la service role no
      // existe en su runtime— sino el backoffice de docs/runbooks/takedown-dmca.md.
      // Cuando F14 siembre administradores en Postgres, `private.es_admin`
      // dejará pasar también a un moderador con sesión, sin tocar el trigger.
      const { error } = await clienteAdministrativo()
        .from("profiles")
        .update({ is_suspended: false, suspended_reason: null, suspended_at: null })
        .eq("id", suspendido.profileId!)
      expect(error, mensajeDeError(error)).toBeNull()

      expect((await suspensionDe(suspendido)).is_suspended).toBe(false)
      expect(await suspendidoEnPublico(suspendido.profileId!)).toBe(false)

      const { data } = await clienteAnonimo()
        .from("profile_blocks")
        .select("id")
        .eq("profile_id", suspendido.profileId!)
      expect((data ?? []).length).toBeGreaterThan(0)
    })
  })
})

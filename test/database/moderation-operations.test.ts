import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

describe("operación de moderación con sesión real", () => {
  const users: UsuarioDePrueba[] = []
  const reports: string[] = []
  let owner: UsuarioDePrueba
  let moderator: UsuarioDePrueba
  let maintenance: UsuarioDePrueba
  let outsider: UsuarioDePrueba
  let author: UsuarioDePrueba
  let reporter: UsuarioDePrueba

  function sql(input: string) {
    try { execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input, stdio: ["pipe", "pipe", "pipe"] }) }
    catch { throw new Error("No se pudo preparar la moderación ficticia local") }
  }
  const setRole = (actor: UsuarioDePrueba, user: UsuarioDePrueba, role: string | null) =>
    actor.supabase.rpc("set_platform_role", { p_user_id: user.id, p_role: role })
  const moderate = (user: UsuarioDePrueba, id: string, version: number, action: string) =>
    user.supabase.rpc("moderate_report", { p_report_id: id, p_expected_version: version, p_action: action, p_note: "Decisión de prueba conductual" })
  async function report(reporterUser: UsuarioDePrueba, subject: UsuarioDePrueba) {
    const { data, error } = await reporterUser.supabase.from("content_reports").insert({
      reporter_user_id: reporterUser.id, reported_profile_id: subject.profileId,
      target_type: "perfil", reason: "otro", details: "Reporte ficticio para probar la operación de moderación",
    }).select("id").single()
    if (error || !data) throw new Error("No se pudo preparar un reporte conductual")
    reports.push(data.id)
    return data.id as string
  }

  beforeAll(async () => {
    const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8" }).trim()
    if (label !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Solo Vibe local")
    for (let n = 0; n < 6; n++) users.push(await crearUsuario())
    ;[owner, moderator, maintenance, outsider, author, reporter] = users
    sql(`insert into private.platform_roles(user_id,role) values('${owner.id}','owner');`)
    expect((await setRole(owner, moderator, "moderator")).error).toBeNull()
    expect((await setRole(owner, maintenance, "maintenance")).error).toBeNull()
    expect((await setRole(owner, author, "moderator")).error).toBeNull()
    expect((await setRole(owner, reporter, "moderator")).error).toBeNull()
  })
  afterAll(async () => {
    if (reports.length) {
      const ids = reports.map(id => `'${id}'`).join(",")
      sql(`delete from private.moderation_events where report_id in (${ids}); delete from public.content_reports where id in (${ids});`)
    }
    if (users.length) {
      const ids = users.map(user => `'${user.id}'`).join(",")
      sql(`delete from private.platform_roles where user_id in (${ids}); delete from private.platform_role_audit where target_user_id in (${ids});`)
    }
    await limpiarUsuarios(...users)
  })

  it("outsider y mantenimiento no consultan cola ni deciden", async () => {
    const id = await report(reporter, outsider)
    expect((await outsider.supabase.rpc("moderation_queue")).error?.code).toBe("42501")
    expect((await maintenance.supabase.rpc("moderation_queue")).error?.code).toBe("42501")
    expect((await moderate(outsider, id, 0, "review")).error?.code).toBe("42501")
    expect((await moderate(maintenance, id, 0, "review")).error?.code).toBe("42501")
  })

  it("moderador consulta la cola pendiente sin habilitar lectura anónima del historial", async () => {
    const id = await report(reporter, outsider)
    const queue = await moderator.supabase.rpc("moderation_queue", { p_status: "pendiente", p_offset: 0 })
    expect(queue.error).toBeNull()
    expect(queue.data).toEqual(expect.arrayContaining([expect.objectContaining({ id })]))
    expect((await clienteAnonimo().rpc("moderation_history", { p_report_id: id })).error?.code).toBe("42501")
    expect((await outsider.supabase.rpc("moderation_history", { p_report_id: id })).error?.code).toBe("42501")
  })

  it("review, suspend y restore cambian estado/version, auditoría y bandera del perfil", async () => {
    const id = await report(reporter, outsider)
    const before = await outsider.supabase.from("profiles").select("is_suspended,suspended_reason,suspended_at").eq("id", outsider.profileId!).single()
    expect(before.data).toMatchObject({ is_suspended: false, suspended_reason: null, suspended_at: null })
    expect((await moderate(moderator, id, 0, "review")).data).toMatchObject({ status: "en_revision", version: 1 })
    expect((await moderate(moderator, id, 1, "suspend")).data).toMatchObject({ status: "aceptado", version: 2 })
    const suspended = await outsider.supabase.from("profiles").select("is_suspended,suspended_reason,suspended_at").eq("id", outsider.profileId!).single()
    expect(suspended.data?.is_suspended).toBe(true)
    expect(suspended.data?.suspended_reason).toBe(`report:${id}`)
    expect(suspended.data?.suspended_at).toBeTruthy()
    expect((await moderate(moderator, id, 2, "restore")).data).toMatchObject({ status: "rechazado", version: 3 })
    const restored = await outsider.supabase.from("profiles").select("is_suspended,suspended_reason,suspended_at").eq("id", outsider.profileId!).single()
    expect(restored.data).toMatchObject({ is_suspended: false, suspended_reason: null, suspended_at: null })
    const history = await moderator.supabase.rpc("moderation_history", { p_report_id: id })
    expect(history.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor_user_id: moderator.id, action: "review", previous_status: "pendiente", new_status: "en_revision" }),
      expect.objectContaining({ actor_user_id: moderator.id, action: "suspend", previous_status: "en_revision", new_status: "aceptado" }),
      expect.objectContaining({ actor_user_id: moderator.id, action: "restore", previous_status: "aceptado", new_status: "rechazado" }),
    ]))
  })

  it("no resuelve un reporte pendiente sin pasarlo primero a revisión", async () => {
    const id = await report(reporter, outsider)
    expect((await moderate(moderator, id, 0, "dismiss")).error?.code).toBe("PT409")
    const queue = await moderator.supabase.rpc("moderation_queue", { p_status: "pendiente", p_offset: 0 })
    expect(queue.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, moderation_version: 0, status: "pendiente" })]))
  })

  it("no restaura un caso aceptado sin suspensión propia ni cambia el perfil", async () => {
    const id = await report(reporter, outsider)
    expect((await moderate(moderator, id, 0, "review")).error).toBeNull()
    expect((await moderate(moderator, id, 1, "accept")).error).toBeNull()
    expect((await moderate(moderator, id, 2, "restore")).error?.code).toBe("PT409")
    const profile = await outsider.supabase.from("profiles").select("is_suspended,suspended_reason,suspended_at").eq("id", outsider.profileId!).single()
    expect(profile.data).toMatchObject({ is_suspended: false, suspended_reason: null, suspended_at: null })
    const queue = await moderator.supabase.rpc("moderation_queue", { p_status: "aceptado", p_offset: 0 })
    expect(queue.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, moderation_version: 2, status: "aceptado" })]))
  })

  it("rechaza versiones obsoletas y serializa dos decisiones concurrentes", async () => {
    const id = await report(reporter, outsider)
    expect((await moderate(moderator, id, 0, "review")).error).toBeNull()
    expect((await moderate(moderator, id, 0, "dismiss")).error?.code).toBe("PT409")
    const results = await Promise.all([moderate(moderator, id, 1, "dismiss"), moderate(owner, id, 1, "accept")])
    expect(results.filter(result => !result.error)).toHaveLength(1)
    expect(results.filter(result => result.error?.code === "PT409")).toHaveLength(1)
  })

  it("el autor y el reportante no se autojuzgan aunque tengan rol moderator", async () => {
    const authorReport = await report(reporter, author)
    const reporterReport = await report(reporter, outsider)
    expect((await moderate(author, authorReport, 0, "review")).error?.code).toBe("42501")
    expect((await moderate(reporter, reporterReport, 0, "review")).error?.code).toBe("42501")
    expect((await moderate(moderator, authorReport, 0, "review")).error).toBeNull()
  })

  it("la revocación de moderación se aplica sin renovar la sesión", async () => {
    const id = await report(reporter, outsider)
    expect((await setRole(owner, moderator, null)).error).toBeNull()
    expect((await moderator.supabase.rpc("moderation_queue")).error?.code).toBe("42501")
    expect((await moderate(moderator, id, 0, "review")).error?.code).toBe("42501")
  })
})

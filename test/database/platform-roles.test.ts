import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"

describe("roles administrativos con sesión real", () => {
  const users: UsuarioDePrueba[] = []
  let owner: UsuarioDePrueba
  let moderator: UsuarioDePrueba
  let maintenance: UsuarioDePrueba
  let outsider: UsuarioDePrueba
  function sql(input: string) {
    try { execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input, stdio: ["pipe", "pipe", "pipe"] }) }
    catch { throw new Error("No se pudo preparar el rol local de pruebas") }
  }
  const permission = (user: UsuarioDePrueba, p_permission: string) => user.supabase.rpc("has_platform_permission", { p_permission })
  const setRole = (actor: UsuarioDePrueba, user: UsuarioDePrueba, p_role: string | null) => actor.supabase.rpc("set_platform_role", { p_user_id: user.id, p_role })
  beforeAll(async () => {
    const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', "supabase_db_vibe"], { encoding: "utf8" }).trim()
    if (label !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Solo Vibe local")
    for (let n=0;n<4;n++) users.push(await crearUsuario())
    ;[owner,moderator,maintenance,outsider]=users
    sql(`insert into private.platform_roles(user_id,role) values('${owner.id}','owner');`)
  })
  afterAll(async () => {
    if (users.length) {
      const ids=users.map(user => `'${user.id}'`).join(",")
      sql(`delete from private.platform_roles where user_id in (${ids}); delete from private.platform_role_audit where target_user_id in (${ids});`)
    }
    await limpiarUsuarios(...users)
  })
  it("sin sesión o sin rol no se obtienen ni asignan permisos", async () => {
    expect((await clienteAnonimo().rpc("has_platform_permission", { p_permission: "roles" })).error).toBeTruthy()
    expect((await permission(outsider,"roles")).data).toBe(false)
    expect((await setRole(outsider,outsider,"owner")).error?.code).toBe("42501")
  })
  it("moderación y mantenimiento son permisos separados", async () => {
    expect((await setRole(owner,moderator,"moderator")).error).toBeNull()
    expect((await setRole(owner,maintenance,"maintenance")).error).toBeNull()
    expect((await permission(moderator,"moderation")).data).toBe(true)
    expect((await permission(moderator,"maintenance")).data).toBe(false)
    expect((await permission(maintenance,"maintenance")).data).toBe(true)
    expect((await permission(maintenance,"moderation")).data).toBe(false)
    expect((await permission(owner,"no-existe")).data).toBe(false)
  })
  it("ni metadatos editables ni un rol subordinado permiten escalar", async () => {
    expect((await outsider.auth.updateUser({ data: { role: "owner", is_admin: true } })).error).toBeNull()
    expect((await permission(outsider,"roles")).data).toBe(false)
    expect((await setRole(moderator,moderator,"owner")).error?.code).toBe("42501")
    expect((await setRole(maintenance,maintenance,"owner")).error?.code).toBe("42501")
    expect((await setRole(owner,outsider,"superadmin")).error?.code).toBe("22023")
  })
  it("revocar tiene efecto en el mismo cliente sin renovar JWT", async () => {
    expect((await setRole(owner,moderator,null)).error).toBeNull()
    expect((await permission(moderator,"moderation")).data).toBe(false)
  })
  it("el registro acredita actor y cambios; un tercero no puede leerlo ni falsificarlo", async () => {
    const result = await owner.supabase.rpc("platform_role_history", { p_limit: 100 })
    expect(result.error).toBeNull()
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor_user_id: owner.id, target_user_id: moderator.id, old_role: null, new_role: "moderator" }),
      expect.objectContaining({ actor_user_id: owner.id, target_user_id: moderator.id, old_role: "moderator", new_role: null }),
    ]))
    expect((await outsider.supabase.rpc("platform_role_history")).error?.code).toBe("42501")
    expect((await owner.supabase.schema("private").from("platform_role_audit").insert({ target_user_id: outsider.id, new_role: "owner" })).error).toBeTruthy()
  })
  it("no se puede retirar al último propietario", async () => {
    expect((await setRole(owner,owner,null)).error?.code).toBe("PT409")
    expect((await setRole(owner,owner,"moderator")).error?.code).toBe("PT409")
    expect((await permission(owner,"roles")).data).toBe(true)
  })
  it("dos propietarios que se retiran a la vez conservan uno activo", async () => {
    expect((await setRole(owner,outsider,"owner")).error).toBeNull()
    const results = await Promise.all([setRole(owner,owner,null),setRole(outsider,outsider,null)])
    expect(results.filter(result => !result.error)).toHaveLength(1)
    expect(results.filter(result => result.error?.code === "PT409")).toHaveLength(1)
    const rights = await Promise.all([permission(owner,"roles"),permission(outsider,"roles")])
    expect(rights.filter(result => result.data === true)).toHaveLength(1)
  })
})

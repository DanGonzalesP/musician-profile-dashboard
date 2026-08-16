import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  type UsuarioDePrueba,
} from "./helpers"

describe("Security Advisor · fronteras explícitas", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Advisors" })
    beto = await crearUsuario({ nombre: "Beto Advisors" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  it("el contador distribuido acepta sólo el bucket, no límites elegidos por el cliente", async () => {
    const { data, error } = await ana.supabase.rpc("consume_authenticated_rate_limit", {
      p_bucket: "upload",
    })

    expect(error).toBeNull()
    expect(data).toEqual([{ is_allowed: true, retry_after: 0 }])

    const intentoHeredado = await ana.supabase.rpc("consume_authenticated_rate_limit", {
      p_bucket: "upload",
      p_limit: 999_999,
      p_window_seconds: 1,
    })
    expect(intentoHeredado.error).toBeTruthy()
  })

  it("rechaza buckets que la aplicación no haya aprobado", async () => {
    const { error } = await ana.supabase.rpc("consume_authenticated_rate_limit", {
      p_bucket: "bucket-inventado",
    })
    expect(error).toBeTruthy()
  })

  it("las tablas internas siguen inaccesibles aunque ahora tengan política explícita", async () => {
    for (const tabla of [
      "audit_log",
      "donations",
      "rate_limit_windows",
      "reserved_usernames",
      "write_rate_limit_windows",
    ]) {
      const { data, error } = await clienteAnonimo().from(tabla).select("*").limit(1)
      expect(error || (data ?? []).length === 0, `${tabla} quedó expuesta`).toBeTruthy()
    }
  })

  it("el respaldo sensible ya no existe en el esquema expuesto", async () => {
    const { error } = await clienteAnonimo().from("_backup_profiles_20260805").select("*").limit(1)
    expect(error).toBeTruthy()
  })

  it("PostgREST reconoce la relación profile_blocks → profiles usada por la portada", async () => {
    const { error } = await clienteAnonimo()
      .from("profile_blocks")
      .select("id, created_at, profiles(display_name)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)

    expect(error).toBeNull()
  })

  it("una cuenta no puede inventar entradas de auditoría", async () => {
    const { error } = await ana.supabase.rpc("registrar_auditoria", {
      p_action: "accion_inventada",
      p_target_table: "profiles",
      p_target_id: beto.profileId,
      p_metadata: { falso: true },
    })
    expect(error).toBeTruthy()
  })

  it("el trigger privado sigue bloqueando usernames reservados", async () => {
    const { error } = await ana.supabase
      .from("profiles")
      .update({ username: "admin" })
      .eq("id", ana.profileId!)
    expect(error).toBeTruthy()
  })

  it("el wrapper de borrado elimina sólo a la cuenta autenticada", async () => {
    const { error } = await ana.supabase.rpc("eliminar_mi_cuenta")
    expect(error).toBeNull()

    const { data: perfiles } = await clienteAnonimo()
      .from("profiles")
      .select("id")
      .in("id", [ana.profileId!, beto.profileId!])

    expect(perfiles?.map((fila) => fila.id)).toEqual([beto.profileId])
  })
})

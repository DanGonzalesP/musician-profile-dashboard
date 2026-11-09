// Ejercita la consulta REAL en una base efímera separada. Nunca modifica el
// esquema/historial de Vibe, ni necesita claves administrativas de la app.
import { execFile, execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { promisify } from "node:util"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prepararMigracionStaging } from "../../scripts/preparar-migracion-staging.mjs"

const exec = promisify(execFile)
const container = "supabase_db_vibe"
const database = `vibe_migration_test_${randomUUID().replaceAll("-", "")}`
let created = false

function args(db: string, query: string) {
  return ["exec", container, "psql", "-X", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", query]
}
function sql(query: string) {
  return execFileSync("docker", args(database, query), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

beforeAll(() => {
  const identity = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}', container], { encoding: "utf8" }).trim()
  if (identity !== "vibe" || !/^vibe_migration_test_[a-f0-9]{32}$/.test(database)) throw new Error("Destino de pruebas no permitido")
  execFileSync("docker", args("postgres", `create database ${database}`), { stdio: "pipe" })
  created = true
  sql(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key, name text not null, statements text[] not null
    );`)
})
beforeEach(() => {
  sql(`drop table if exists public.migration_probe;
    truncate supabase_migrations.schema_migrations;
    insert into supabase_migrations.schema_migrations values ('0000', 'baseline', array['baseline']);`)
})
afterAll(() => {
  if (created && /^vibe_migration_test_[a-f0-9]{32}$/.test(database)) {
    execFileSync("docker", args("postgres", `drop database ${database}`), { stdio: "pipe" })
  }
})

describe("migración e historial atómicos en Postgres", () => {
  it("confirma DDL y registra exactamente el SQL original", () => {
    const original = "begin; create table migration_probe(value text); insert into migration_probe values ('it''s ready'); commit;"
    sql(prepararMigracionStaging("0001", "ejemplo", original))
    expect(sql("select value from migration_probe")).toBe("it's ready")
    expect(sql("select statements[1] from supabase_migrations.schema_migrations where version = '0001'")).toBe(original)
  })

  it("deshace el DDL si no se puede registrar el historial", () => {
    sql("alter table supabase_migrations.schema_migrations add constraint reject_probe check (name <> 'rechazada')")
    try {
      expect(() => sql(prepararMigracionStaging("0001", "rechazada", "begin; create table migration_probe(value text); commit;"))).toThrow()
      expect(sql("select to_regclass('migration_probe') is null")).toBe("t")
      expect(sql("select max(version) from supabase_migrations.schema_migrations")).toBe("0000")
    } finally {
      sql("alter table supabase_migrations.schema_migrations drop constraint reject_probe")
    }
  })

  it("deshace todo y no registra una migración con fallo SQL", () => {
    expect(() => sql(prepararMigracionStaging("0001", "fallida", "begin; create table migration_probe(value text); select 1 / 0; commit;"))).toThrow()
    expect(sql("select to_regclass('migration_probe') is null")).toBe("t")
    expect(sql("select max(version) from supabase_migrations.schema_migrations")).toBe("0000")
  })

  it("rechaza una versión fuera de orden antes de modificar el esquema", () => {
    expect(() => sql(prepararMigracionStaging("0002", "adelantada", "begin; create table migration_probe(value text); commit;"))).toThrow()
    expect(sql("select to_regclass('migration_probe') is null")).toBe("t")
  })

  it("dos aplicadores concurrentes no repiten la misma migración", async () => {
    const query = prepararMigracionStaging("0001", "concurrente", "begin; create table migration_probe(value text); select pg_sleep(0.2); insert into migration_probe values ('una'); commit;")
    const results = await Promise.allSettled([exec("docker", args(database, query)), exec("docker", args(database, query))])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(sql("select count(*) from migration_probe")).toBe("1")
    expect(sql("select count(*) from supabase_migrations.schema_migrations where version = '0001'")).toBe("1")
  })
})

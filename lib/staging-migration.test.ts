import { describe, expect, it } from "vitest"
import { prepararMigracionStaging } from "../scripts/preparar-migracion-staging.mjs"

describe("preparación cerrada de migraciones de staging", () => {
  it("acepta comentarios, cadenas y funciones con palabras de transacción", () => {
    const sql = `-- comentario inicial\nBEGIN;
/* externo /* anidado */ */
create function ejemplo() returns text language sql as $body$ select 'commit; rollback;' $body$;
select E'comilla\\\'; begin;', 'it''s commit;', "commit;";
COMMIT; -- comentario final`
    expect(() => prepararMigracionStaging("0071", "ejemplo", sql)).not.toThrow()
  })

  it.each([
    "create table ejemplo(id int);",
    "begin; create table ejemplo(id int); rollback;",
    "begin; create table ejemplo(id int); commit; begin; select 1; commit;",
    "begin; commit;",
    "begin; select 1; commit; select 2;",
    "begin; set standard_conforming_strings = off; select 1; commit;",
    "begin; select 1; savepoint salto; commit;",
    "begin; select 'sin cerrar; commit;",
    "begin; do $body$ sin cerrar; commit;",
    "begin; select 1; commit; /* sin cerrar",
  ])("rechaza SQL ambiguo o capaz de salir de la transacción: %s", sql => {
    expect(() => prepararMigracionStaging("0071", "ejemplo", sql)).toThrow()
  })

  it("rechaza identificadores que no sean de migración", () => {
    expect(() => prepararMigracionStaging("71", "ejemplo", "begin; select 1; commit;")).toThrow()
    expect(() => prepararMigracionStaging("0000", "ejemplo", "begin; select 1; commit;")).toThrow()
    expect(() => prepararMigracionStaging("0071", "nombre'; --", "begin; select 1; commit;")).toThrow()
  })
})

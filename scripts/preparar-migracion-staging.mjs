// Prepara SQL, sin conexión ni credenciales. La migración y su historial viajan
// en UNA transacción; el bloqueo y la comprobación también viven dentro de ella.
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Separar sentencias respetando comentarios, identificadores, cadenas y cuerpos
// dollar-quoted. No confundir un COMMIT dentro de una función con el externo.
function sentencias(sql) {
  const result = []
  let start = 0, visible = "", i = 0
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i)
      i = end < 0 ? sql.length : end + 1
      visible += " "
    } else if (sql.startsWith("/*", i)) {
      let depth = 1
      i += 2
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2 }
        else if (sql.startsWith("*/", i)) { depth--; i += 2 }
        else i++
      }
      if (depth) throw new Error("Comentario SQL sin cerrar")
      visible += " "
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]
      const escaped = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(Math.max(0, i - 2), i))
      i++
      let closed = false
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") { i += 2; continue }
        if (sql[i++] !== quote) continue
        if (sql[i] === quote) { i++; continue }
        closed = true
        break
      }
      if (!closed) throw new Error("Cadena SQL sin cerrar")
      visible += " quoted "
    } else if (sql[i] === "$" && !/[\w$]/.test(sql[i - 1] ?? "")) {
      const tag = /^(?:\$[A-Za-z_][\w]*\$|\$\$)/.exec(sql.slice(i))?.[0]
      if (!tag) { visible += sql[i++]; continue }
      const end = sql.indexOf(tag, i + tag.length)
      if (end < 0) throw new Error("Cuerpo SQL sin cerrar")
      i = end + tag.length
      visible += " quoted "
    } else if (sql[i] === ";") {
      result.push({ start, end: ++i, command: visible.trim().toLowerCase() })
      start = i
      visible = ""
    } else visible += sql[i++]
  }
  if (visible.trim()) throw new Error("Sentencia SQL sin punto y coma final")
  return result.filter(item => item.command)
}

export function prepararMigracionStaging(version, name, sql) {
  if (!/^\d{4}$/.test(version) || Number(version) < 1 || !/^[a-z0-9_]+$/.test(name)) {
    throw new Error("Identificador de migración inválido")
  }
  const statements = sentencias(sql)
  const first = statements[0], last = statements.at(-1)
  if (first?.command !== "begin" || last?.command !== "commit" || statements.length < 3) {
    throw new Error("La migración debe tener una única transacción BEGIN/COMMIT explícita")
  }
  const body = statements.slice(1, -1)
  if (body.some(item => /^(?:begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|set\s+(?:local\s+)?(?:transaction|standard_conforming_strings))\b/.test(item.command))) {
    throw new Error("Control de transacción interno no permitido")
  }
  const previous = String(Number(version) - 1).padStart(4, "0")
  const literal = value => "'" + value.replaceAll("'", "''") + "'"
  return `begin;
set local standard_conforming_strings = on;
select pg_advisory_xact_lock(hashtextextended('vibe/staging/migrations', 0));
do $vibe_history_guard$
begin
  if (select max(version) from supabase_migrations.schema_migrations) is distinct from '${previous}' then
    raise exception 'Historial de staging cambiado; no se aplica ${version}';
  end if;
end;
$vibe_history_guard$;
${sql.slice(first.end, last.start)}
insert into supabase_migrations.schema_migrations(version, name, statements)
values ('${version}', '${name}', array[${literal(sql)}]);
commit;
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2]
  if (!/^\d{4}$/.test(version ?? "")) throw new Error("Uso: node scripts/preparar-migracion-staging.mjs 0071")
  const directory = join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations")
  const files = readdirSync(directory).filter(name => name.startsWith(`${version}_`) && name.endsWith(".sql"))
  if (files.length !== 1) throw new Error("Debe existir exactamente una migración con esa versión")
  const name = files[0].slice(5, -4)
  process.stdout.write(prepararMigracionStaging(version, name, readFileSync(join(directory, files[0]), "utf8")))
}

// Servidor falso de PostgREST/GoTrue para las pruebas E2E.
//
// POR QUÉ EXISTE
// El perfil público de Vibe se arma con varias consultas encadenadas
// (resolveProfileByUsername → profiles → profile_blocks → catálogo). Mockear
// eso desde el navegador con `page.route` sólo cubre la mitad: en cuanto una
// consulta se hace desde el servidor (generateMetadata, sitemap, y el render
// en servidor del bloque D) el navegador no la ve y no hay nada que
// interceptar.
//
// La solución que sí cubre las dos mitades es apuntar `NEXT_PUBLIC_SUPABASE_URL`
// a este proceso. Entonces TODO —Server Components, metadatos, sitemap y el
// cliente— habla con un PostgREST de mentira que sirve `datos.json`. Sin
// Docker, sin credenciales, sin datos reales y sin red: es reproducible en
// cualquier máquina y en CI.
//
// ALCANCE DELIBERADO: implementa exactamente el subconjunto de PostgREST que
// esta aplicación usa (select con embeds, filtros por operador, or, order,
// limit, offset y la negociación de "un solo objeto"). No pretende ser
// PostgREST: pretende ser suficiente y honesto. Lo que no entiende lo dice
// en la salida, para que una consulta nueva no falle en silencio.
//
// Uso: node tests/e2e/fixtures/servidor-supabase.mjs [puerto]

import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUERTO = Number(process.argv[2] ?? process.env.E2E_SUPABASE_PORT ?? 54999)

/** @type {Record<string, Record<string, unknown>[]>} */
const DATOS = JSON.parse(readFileSync(join(AQUI, "datos.json"), "utf8"))

// Las tablas que la app puede consultar. Una tabla ausente devuelve [] (que es
// lo que devolvería Postgres con RLS cerrada), nunca un error de red.
function tabla(nombre) {
  const filas = DATOS[nombre]
  return Array.isArray(filas) ? filas.map((f) => ({ ...f })) : []
}

// Relaciones que la app pide como recurso embebido (`profiles ( ... )`).
// clave: `${tablaBase}.${nombreEmbebido}`
const RELACIONES = {
  "products.profiles": { tipo: "uno", columnaLocal: "seller_id", tablaDestino: "profiles", columnaDestino: "id" },
  "services.profiles": { tipo: "uno", columnaLocal: "profile_id", tablaDestino: "profiles", columnaDestino: "id" },
  "music_feed.profiles": { tipo: "uno", columnaLocal: "profile_id", tablaDestino: "profiles", columnaDestino: "id" },
  "profile_blocks.profiles": { tipo: "uno", columnaLocal: "profile_id", tablaDestino: "profiles", columnaDestino: "id" },
  "feed_posts.profiles": { tipo: "uno", columnaLocal: "profile_id", tablaDestino: "profiles", columnaDestino: "id" },
  "profiles.profile_blocks": { tipo: "muchos", columnaLocal: "id", tablaDestino: "profile_blocks", columnaDestino: "profile_id" },
  "profiles.products": { tipo: "muchos", columnaLocal: "id", tablaDestino: "products", columnaDestino: "seller_id" },
  "profiles.services": { tipo: "muchos", columnaLocal: "id", tablaDestino: "services", columnaDestino: "profile_id" },
}

// ─── Parseo del `select` ─────────────────────────────────────────────────────

/** Corta por comas de primer nivel, respetando los paréntesis de los embeds. */
function partirNivelSuperior(texto) {
  const partes = []
  let actual = ""
  let profundidad = 0
  for (const c of texto) {
    if (c === "(") profundidad++
    if (c === ")") profundidad--
    if (c === "," && profundidad === 0) {
      partes.push(actual)
      actual = ""
      continue
    }
    actual += c
  }
  if (actual.trim()) partes.push(actual)
  return partes.map((p) => p.trim()).filter(Boolean)
}

/**
 * `id, username, profiles!inner ( a, b )` →
 * { columnas: ["id","username"], embeds: [{ nombre:"profiles", interno:true, select:"a, b" }] }
 */
function parsearSelect(select) {
  const columnas = []
  const embeds = []
  if (!select || select.trim() === "*") return { columnas: ["*"], embeds }

  for (const parte of partirNivelSuperior(select)) {
    const conParentesis = parte.indexOf("(")
    if (conParentesis === -1) {
      columnas.push(parte)
      continue
    }
    const cabecera = parte.slice(0, conParentesis).trim()
    const interno = cabecera.includes("!inner")
    const nombre = cabecera.replace("!inner", "").trim()
    const interior = parte.slice(conParentesis + 1, parte.lastIndexOf(")"))
    embeds.push({ nombre, interno, select: interior })
  }
  return { columnas, embeds }
}

function proyectar(fila, columnas) {
  if (columnas.length === 0 || columnas.includes("*")) return { ...fila }
  const salida = {}
  for (const columna of columnas) {
    // `alias:columna` — la app no lo usa hoy, pero cuesta cuatro líneas.
    const [izquierda, derecha] = columna.includes(":") ? columna.split(":") : [columna, columna]
    salida[izquierda.trim()] = fila[derecha.trim()] ?? null
  }
  return salida
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function normalizarLiteral(bruto) {
  if (bruto === "null") return null
  if (bruto === "true") return true
  if (bruto === "false") return false
  const sinComillas = bruto.replace(/^"|"$/g, "")
  return sinComillas
}

function comparar(valor, operador, bruto) {
  const esperado = normalizarLiteral(bruto)
  switch (operador) {
    case "eq":
      return String(valor) === String(esperado)
    case "neq":
      return String(valor) !== String(esperado)
    case "is":
      return esperado === null ? valor === null || valor === undefined : valor === esperado
    case "gt":
      return Number(valor) > Number(esperado)
    case "gte":
      return Number(valor) >= Number(esperado)
    case "lt":
      // También sirve para fechas ISO: la comparación de cadenas es correcta.
      return typeof valor === "string" ? valor < String(esperado) : Number(valor) < Number(esperado)
    case "lte":
      return typeof valor === "string" ? valor <= String(esperado) : Number(valor) <= Number(esperado)
    case "in": {
      const lista = String(esperado).replace(/^\(|\)$/g, "").split(",").map((v) => normalizarLiteral(v.trim()))
      return lista.some((v) => String(v) === String(valor))
    }
    case "like":
    case "ilike": {
      const patron = String(esperado).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")
      return new RegExp(`^${patron}$`, operador === "ilike" ? "i" : "").test(String(valor ?? ""))
    }
    case "cs": // contains, para arreglos
      return Array.isArray(valor) && String(esperado).replace(/^\{|\}$/g, "").split(",").every((v) => valor.includes(v))
    default:
      console.warn(`[servidor-supabase] operador no soportado: ${operador}`)
      return true
  }
}

/** `not.is.null` / `eq.x` → aplica la negación si viene con prefijo `not.`. */
function aplicarCondicion(fila, columna, expresion) {
  const negado = expresion.startsWith("not.")
  const limpia = negado ? expresion.slice(4) : expresion
  const punto = limpia.indexOf(".")
  const operador = punto === -1 ? "eq" : limpia.slice(0, punto)
  const bruto = punto === -1 ? limpia : limpia.slice(punto + 1)
  const resultado = comparar(fila[columna], operador, bruto)
  return negado ? !resultado : resultado
}

/** `or=(user_id.eq.X,owner_user_id.eq.Y)` */
function aplicarOr(fila, expresion) {
  const interior = expresion.replace(/^\(|\)$/g, "")
  return partirNivelSuperior(interior).some((termino) => {
    const punto = termino.indexOf(".")
    if (punto === -1) return false
    return aplicarCondicion(fila, termino.slice(0, punto), termino.slice(punto + 1))
  })
}

const PARAMETROS_RESERVADOS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"])

// ─── Consulta ────────────────────────────────────────────────────────────────

function consultar(nombreTabla, params) {
  const { columnas, embeds } = parsearSelect(params.get("select") ?? "*")
  let filas = tabla(nombreTabla)

  for (const [clave, valor] of params.entries()) {
    if (PARAMETROS_RESERVADOS.has(clave)) continue
    if (clave === "or") {
      filas = filas.filter((fila) => aplicarOr(fila, valor))
      continue
    }
    filas = filas.filter((fila) => aplicarCondicion(fila, clave, valor))
  }

  const orden = params.get("order")
  if (orden) {
    // `created_at.desc.nullslast` → columna + dirección.
    const [columna, direccion = "asc"] = orden.split(".")
    const factor = direccion.startsWith("desc") ? -1 : 1
    filas.sort((a, b) => {
      const va = a[columna]
      const vb = b[columna]
      if (va === vb) return 0
      return (va > vb ? 1 : -1) * factor
    })
  }

  // Los embeds se resuelven ANTES del recorte, porque `!inner` puede descartar
  // filas (es un join interno, no una decoración).
  filas = filas.map((fila) => {
    const proyectada = proyectar(fila, columnas)
    for (const embed of embeds) {
      const relacion = RELACIONES[`${nombreTabla}.${embed.nombre}`]
      if (!relacion) {
        console.warn(`[servidor-supabase] relación desconocida: ${nombreTabla}.${embed.nombre}`)
        proyectada[embed.nombre] = relacion?.tipo === "muchos" ? [] : null
        continue
      }
      const { columnas: columnasEmbed } = parsearSelect(embed.select)
      const destino = tabla(relacion.tablaDestino).filter(
        (d) => String(d[relacion.columnaDestino]) === String(fila[relacion.columnaLocal])
      )
      proyectada[embed.nombre] =
        relacion.tipo === "muchos"
          ? destino.map((d) => proyectar(d, columnasEmbed))
          : destino[0]
            ? proyectar(destino[0], columnasEmbed)
            : null
    }
    // `!inner` sin coincidencia descarta la fila.
    for (const embed of embeds) {
      if (!embed.interno) continue
      const v = proyectada[embed.nombre]
      if (v === null || (Array.isArray(v) && v.length === 0)) return null
    }
    return proyectada
  })
  filas = filas.filter(Boolean)

  const offset = Number(params.get("offset") ?? 0)
  const limite = params.get("limit") ? Number(params.get("limit")) : undefined
  return limite === undefined ? filas.slice(offset) : filas.slice(offset, offset + limite)
}

// ─── RPC simuladas ───────────────────────────────────────────────────────────

/** Cuerpo JSON de la petición, o null si no lo hay. */
function leerCuerpo(req) {
  return new Promise((resolve) => {
    let texto = ""
    req.on("data", (trozo) => {
      texto += trozo
    })
    req.on("end", () => {
      try {
        resolve(texto ? JSON.parse(texto) : null)
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Equivalente en JavaScript de `public.descubrimiento_perfiles` (migración
 * 0012): una fila por perfil, con su conteo y sus categorías, excluyendo
 * perfiles suspendidos e ítems inactivos.
 *
 * Existe para que las pruebas ejerciten el camino PREFERIDO del código (el
 * RPC) y no sólo el respaldo. Si esta función y la SQL divergen, lo que se
 * prueba deja de ser lo que corre en producción — por eso las reglas están
 * escritas acá igual de explícitas que en el .sql.
 */
function descubrimientoPerfiles(tipo, limite) {
  const esProductos = tipo === "productos"
  if (!esProductos && tipo !== "servicios") return []
  const items = esProductos ? tabla("products") : tabla("services")
  const columnaPerfil = esProductos ? "seller_id" : "profile_id"
  const perfiles = tabla("profiles")

  const porUsuario = new Map()
  for (const item of items) {
    if (item.is_active === false) continue
    const perfil = perfiles.find((p) => String(p.id) === String(item[columnaPerfil]))
    if (!perfil || perfil.is_suspended === true || !perfil.username) continue

    const actual = porUsuario.get(perfil.username) ?? {
      username: perfil.username,
      display_name: perfil.display_name,
      profile_type: perfil.profile_type,
      musician_roles: perfil.musician_roles,
      categorias: [],
      total: 0,
    }
    actual.total += 1
    if (typeof item.category === "string" && item.category && !actual.categorias.includes(item.category)) {
      actual.categorias.push(item.category)
    }
    porUsuario.set(perfil.username, actual)
  }

  return [...porUsuario.values()]
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
    .slice(0, Math.max(Number(limite) || 60, 1))
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

// supabase-js manda apikey/authorization/x-client-info, lo que dispara el
// preflight del navegador. Sin estas cabeceras el navegador descarta la
// respuesta y el cliente ve "failed to fetch".
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "content-range, content-type",
  "Access-Control-Max-Age": "86400",
}

function responder(res, estado, cuerpo, extra = {}) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)
  res.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS,
    ...extra,
  })
  res.end(texto)
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PUERTO}`)

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS)
    return res.end()
  }

  // Sonda de vida para el `webServer` de Playwright.
  if (url.pathname === "/__salud") return responder(res, 200, { estado: "ok" })

  // GoTrue: siempre visitante anónimo. Un 401 en /auth/v1/user es exactamente
  // lo que responde Supabase sin sesión, y es lo que supabase-js espera.
  if (url.pathname.startsWith("/auth/v1/")) {
    if (url.pathname.endsWith("/user")) {
      return responder(res, 401, { message: "Invalid Refresh Token: no session" })
    }
    return responder(res, 200, {})
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const nombreTabla = decodeURIComponent(url.pathname.slice("/rest/v1/".length)).replace(/\/$/, "")

    // RPC de sólo lectura. Se implementan a conciencia, una por una: si una
    // prueba necesitara otra, aparece acá o falla ruidosamente.
    if (nombreTabla.startsWith("rpc/")) {
      const nombreFuncion = nombreTabla.slice("rpc/".length)
      return leerCuerpo(req).then((cuerpo) => {
        if (nombreFuncion === "descubrimiento_perfiles") {
          return responder(res, 200, descubrimientoPerfiles(cuerpo?.p_tipo, cuerpo?.p_limite))
        }
        return responder(res, 404, {
          code: "42883",
          message: `El servidor de fixtures no simula la función ${nombreFuncion}.`,
        })
      })
    }

    // Las escrituras no se simulan: las pruebas E2E locales son de LECTURA
    // pública. Una escritura inesperada debe ser ruidosa, no silenciosa.
    if (req.method !== "GET" && req.method !== "HEAD") {
      return responder(res, 405, {
        code: "E2E_SOLO_LECTURA",
        message: `El servidor de fixtures no simula ${req.method} sobre ${nombreTabla}.`,
      })
    }

    const filas = consultar(nombreTabla, url.searchParams)
    const aceptar = req.headers["accept"] ?? ""

    // Negociación de "un solo objeto" (.single() / .maybeSingle()).
    if (String(aceptar).includes("application/vnd.pgrst.object+json")) {
      if (filas.length === 0) {
        return responder(res, 406, {
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        })
      }
      return responder(res, 200, filas[0])
    }

    return responder(res, 200, filas, {
      "Content-Range": `0-${Math.max(filas.length - 1, 0)}/${filas.length}`,
    })
  }

  responder(res, 404, { message: `Ruta no simulada: ${url.pathname}` })
})

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`[servidor-supabase] fixtures sirviendo en http://127.0.0.1:${PUERTO}`)
})

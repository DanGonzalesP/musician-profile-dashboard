// Smoke post-despliegue (F13). La versión ejecutable del "Paso 4 —
// Verificación" de DESPLIEGUE.md y de los criterios externos de F0: en vez de
// pegar curls a mano tras cada deploy, se corre esto y falla ruidosamente si
// alguna invariante de seguridad se rompió.
//
// NO usa credenciales ni datos reales: sólo golpea endpoints públicos y
// comprueba comportamientos que NO deben cambiar nunca (un 401 sigue siendo
// 401, un host falso sigue dando 400). Por eso es seguro apuntarlo tanto a
// staging como —con cuidado— a producción.
//
// Uso:
//   node scripts/smoke-staging.mjs https://staging.tu-dominio
//   SMOKE_BASE_URL=https://... SMOKE_PROFILE=algun-username node scripts/smoke-staging.mjs
//
// SMOKE_PROFILE es opcional: si se define, además comprueba que ese perfil
// público sirve HTML con contenido (la prueba de que el render server de F10
// funciona). Sin él, ese chequeo se omite en vez de inventar un username.
//
// SMOKE_PERMITIR_DEGRADADO=1 acepta un `/api/health` en 503 siempre que
// responda con la forma correcta. Sirve para correr el smoke contra un entorno
// donde una dependencia falta A PROPÓSITO —el servidor local de las pruebas
// E2E no tiene R2—, sin tener que aflojar el chequeo para producción, donde
// "degradado" tiene que seguir siendo un fallo ruidoso.

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "")

if (!baseUrl) {
  console.error(
    [
      "Falta la URL base.",
      "Uso: node scripts/smoke-staging.mjs https://staging.tu-dominio",
      "  o:  SMOKE_BASE_URL=https://... node scripts/smoke-staging.mjs",
    ].join("\n")
  )
  process.exit(2)
}

const TIMEOUT_MS = 10000

async function pedir(ruta, opciones = {}) {
  const controlador = new AbortController()
  const t = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${baseUrl}${ruta}`, { ...opciones, signal: controlador.signal, redirect: "manual" })
  } finally {
    clearTimeout(t)
  }
}

let fallos = 0
const resultados = []

function registrar(nombre, ok, detalle) {
  resultados.push({ nombre, ok, detalle })
  if (!ok) fallos++
  const marca = ok ? "✅" : "❌"
  console.log(`${marca} ${nombre}${detalle ? ` — ${detalle}` : ""}`)
}

async function chequear(nombre, fn) {
  try {
    const { ok, detalle } = await fn()
    registrar(nombre, ok, detalle)
  } catch (error) {
    registrar(nombre, false, `excepción: ${error?.message ?? error}`)
  }
}

// ── Los chequeos ────────────────────────────────────────────────────────────

await chequear("GET /api/health responde y reporta estado", async () => {
  const res = await pedir("/api/health")
  const cuerpo = await res.json().catch(() => null)
  // 200 (sano) o 503 (degradado) son ambos "responde"; lo que no debe pasar es
  // un 500 sin cuerpo o un timeout. El smoke marca degradado como fallo blando.
  const respondeBien = (res.status === 200 || res.status === 503) && typeof cuerpo?.estado === "string"
  const permitirDegradado = process.env.SMOKE_PERMITIR_DEGRADADO === "1"
  return {
    ok: respondeBien && (res.status === 200 || permitirDegradado),
    detalle: `status ${res.status}, estado=${cuerpo?.estado ?? "?"}${
      permitirDegradado && res.status === 503 ? " (degradado aceptado por SMOKE_PERMITIR_DEGRADADO)" : ""
    }`,
  }
})

await chequear("GET /api/health no filtra internos", async () => {
  const texto = await (await pedir("/api/health")).text()
  // Un endpoint de salud es público: no puede nombrar el bucket, la URL de
  // Supabase ni nada que sirva para atacar la infraestructura.
  const filtra = /supabase\.co|r2\.dev|cloudflarestorage|secret|access[_-]?key|token/i.test(texto)
  return { ok: !filtra, detalle: filtra ? "la respuesta menciona un interno" : "limpio" }
})

await chequear("POST /api/cleanup-orphaned-files sin sesión → 401", async () => {
  const res = await pedir("/api/cleanup-orphaned-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "audio" }),
  })
  return { ok: res.status === 401, detalle: `status ${res.status} (esperado 401)` }
})

await chequear("GET /api/image-proxy con host no permitido → 400", async () => {
  const res = await pedir("/api/image-proxy?url=https://host-que-no-es-el-bucket.example.com/x.png")
  return { ok: res.status === 400, detalle: `status ${res.status} (esperado 400)` }
})

await chequear("GET /sitemap.xml tiene entradas", async () => {
  const res = await pedir("/sitemap.xml")
  const texto = res.ok ? await res.text() : ""
  const tieneUrls = texto.includes("<url>") || texto.includes("<loc>")
  return { ok: res.ok && tieneUrls, detalle: `status ${res.status}, url tags: ${tieneUrls}` }
})

await chequear("GET /robots.txt responde", async () => {
  const res = await pedir("/robots.txt")
  return { ok: res.ok, detalle: `status ${res.status}` }
})

const perfil = process.env.SMOKE_PROFILE
if (perfil) {
  await chequear(`GET /${perfil} sirve HTML con contenido (render server, F10)`, async () => {
    const res = await pedir(`/${encodeURIComponent(perfil)}`)
    const html = res.ok ? await res.text() : ""
    // La prueba de que el contenido está en el HTML y no en un esqueleto que se
    // hidrata: el nombre del artista o algún bloque debe venir en el cuerpo.
    const tieneContenido = html.length > 2000 && /<(h1|h2|main|article)/i.test(html)
    return { ok: res.ok && tieneContenido, detalle: `status ${res.status}, ${html.length} bytes` }
  })
} else {
  console.log("ℹ️  SMOKE_PROFILE no definido: se omite el chequeo de render de perfil público.")
}

// ── Veredicto ────────────────────────────────────────────────────────────────

console.log("")
if (fallos > 0) {
  console.error(`Smoke FALLÓ: ${fallos} de ${resultados.length} chequeos en rojo contra ${baseUrl}.`)
  process.exit(1)
}
console.log(`Smoke OK: ${resultados.length} chequeos en verde contra ${baseUrl}.`)

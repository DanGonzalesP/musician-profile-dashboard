import { appendFile } from "node:fs/promises"

// Sin sesión, claves ni dependencias instaladas. Sólo se ejecuta por petición
// explícita o por el flujo habilitado en el repositorio empresarial.
const report = { checkedAt: new Date().toISOString(), status: "error", checks: [] }
const expectedVersion = process.env.VIBE_EXPECTED_VERSION?.trim().toLowerCase() || ""

async function check(url, kind) {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let response
  try {
    response = await fetch(url, { redirect: "manual", signal: controller.signal,
      headers: { Accept: kind === "health" ? "application/json" : "text/html", "Cache-Control": "no-cache" } })
    if (response.status === 429) return { kind, ok: false, httpStatus: 429, reason: "rate_limited" }
    // Health devuelve 503 tanto por dependencia degradada como por falta del
    // limitador. Leer su contrato acotado permite distinguirlos sin publicar
    // cuerpos ni mensajes internos. Un 503 jamás se convierte en éxito.
    if (response.status !== 200 && !(kind === "health" && response.status === 503)) {
      return { kind, ok: false, httpStatus: response.status, reason: "http_status" }
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (kind === "page") return { kind, ok: contentType.includes("text/html"), httpStatus: 200, reason: contentType.includes("text/html") ? "ok" : "unexpected_content" }
    if (!contentType.includes("application/json")) return { kind, ok: false, httpStatus: response.status, reason: "unexpected_content" }
    const reader = response.body?.getReader()
    if (!reader) return { kind, ok: false, reason: "empty_body" }
    let size = 0
    const chunks = []
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 16_384) return { kind, ok: false, reason: "oversized_body" }
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    const validDependency = value => value === "ok" || value === "error"
    const validHealth = (body?.estado === "ok" || body?.estado === "degradado") &&
      validDependency(body?.dependencias?.supabase) && validDependency(body?.dependencias?.r2)
    if (!validHealth) return { kind, ok: false, httpStatus: response.status,
      reason: response.status === 503 ? "health_unavailable" : "unexpected_content" }
    const dependencies = { supabase: body.dependencias.supabase, r2: body.dependencias.r2 }
    const dependenciesOk = body.estado === "ok" && dependencies.supabase === "ok" && dependencies.r2 === "ok"
    const version = typeof body?.version === "string" && /^[a-zA-Z0-9._-]{1,40}$/.test(body.version) ? body.version : "unknown"
    const versionOk = !expectedVersion || version.toLowerCase() === expectedVersion.slice(0, 7)
    return { kind, ok: response.status === 200 && dependenciesOk && versionOk,
      httpStatus: response.status, version, dependencies,
      reason: !dependenciesOk ? "dependencies_not_ready" : response.status !== 200 ? "http_status" : !versionOk ? "version_mismatch" : "ok" }
  } catch {
    return { kind, ok: false, reason: controller.signal.aborted ? "timeout" : "connection_or_response_error" }
  } finally {
    clearTimeout(timer)
    await response?.body?.cancel().catch(() => {})
    report.checks.push({ kind, durationMs: Math.round(performance.now() - start) })
  }
}

try {
  const raw = process.env.VIBE_MONITOR_ORIGIN?.trim()
  if (!raw) throw new Error("configuration")
  const origin = new URL(raw)
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash ||
    origin.pathname !== "/" || (origin.port && origin.port !== "443") ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin.hostname) || origin.hostname.endsWith(".localhost") ||
    (expectedVersion && !/^[a-f0-9]{7,40}$/i.test(expectedVersion))) throw new Error("configuration")
  for (const [path, kind] of [["/", "page"], ["/api/health", "health"]]) {
    const result = await check(new URL(path, origin), kind)
    Object.assign(report.checks.at(-1), result)
  }
  report.status = report.checks.every(result => result.ok) ? "ok" : "error"
} catch {
  report.configurationError = true
}

const output = JSON.stringify(report, null, 2)
console.log(output)
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Disponibilidad de Vibe\n\n\`\`\`json\n${output}\n\`\`\`\n`)
}
if (report.status !== "ok") process.exitCode = 1

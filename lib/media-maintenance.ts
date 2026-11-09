export interface MaintenanceBucket {
  put(key: string, value: Uint8Array, options: { customMetadata: Record<string, string>; httpMetadata: { cacheControl: string } }): Promise<{ size: number; etag: string } | null>
}

export interface MaintenanceEnv {
  ENABLE_MEDIA_MAINTENANCE?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  MEDIA_MAINTENANCE_KEY?: string
  MEDIA_MAINTENANCE_KEY_ID?: string
  VIBE_MEDIA?: MaintenanceBucket
}

interface Claim { leaseId: string; owner: string; keys: string[] }
/** Sólo estados y cantidades; nunca identificadores de usuarios o archivos. */
export interface MaintenanceProgress {
  phase: "configuration" | "claim" | "blocked" | "storage" | "retire" | "finish"
  outcome: "running" | "disabled" | "idle" | "completed"
  planned: number
  retired: number
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY_ID = /^[a-zA-Z0-9_-]{1,100}$/
const HEX_KEY = /^[0-9a-f]{64}$/i
const TIMEOUT_MS = 10_000

function settings(env: MaintenanceEnv): { endpoint: string; anon: string; key: string; keyId: string; bucket: MaintenanceBucket } | null {
  if (env.ENABLE_MEDIA_MAINTENANCE !== "true" || !env.VIBE_MEDIA || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.MEDIA_MAINTENANCE_KEY || !env.MEDIA_MAINTENANCE_KEY_ID) return null
  if (!HEX_KEY.test(env.MEDIA_MAINTENANCE_KEY) || !KEY_ID.test(env.MEDIA_MAINTENANCE_KEY_ID)) return null
  try {
    const url = new URL(env.SUPABASE_URL)
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return null
    return { endpoint: url.origin, anon: env.SUPABASE_ANON_KEY, key: env.MEDIA_MAINTENANCE_KEY, keyId: env.MEDIA_MAINTENANCE_KEY_ID, bucket: env.VIBE_MEDIA }
  } catch { return null }
}

async function signature(secret: string, payload: object): Promise<string> {
  const bytes = Uint8Array.from(secret.match(/../g)!, (part) => Number.parseInt(part, 16))
  const cryptoKey = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(JSON.stringify(payload)))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function validKey(key: unknown, owner: string): key is string {
  if (typeof key !== "string" || key.length > 1024 || key.includes("\\")) return false
  const parts = key.split("/")
  return /^(images|audio|video)$/.test(parts[0] ?? "") && parts[1] === owner && parts.length >= 3 && parts.every((part) => !!part && part !== "." && part !== ".." && /^[a-zA-Z0-9._~-]+$/.test(part))
}

function parseClaim(value: unknown): { job: Claim | null; blocked: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Media maintenance failed")
  const data = value as Record<string, unknown>
  if (typeof data.blocked !== "boolean") throw new Error("Media maintenance failed")
  if (data.job === null) return { job: null, blocked: data.blocked }
  if (!data.job || typeof data.job !== "object" || Array.isArray(data.job)) throw new Error("Media maintenance failed")
  const job = data.job as Record<string, unknown>
  if (data.blocked || typeof job.leaseId !== "string" || !UUID.test(job.leaseId) || typeof job.owner !== "string" || !UUID.test(job.owner) || !Array.isArray(job.keys) || job.keys.length > 20 || !job.keys.every((key) => validKey(key, job.owner as string)) || new Set(job.keys).size !== job.keys.length) throw new Error("Media maintenance failed")
  return { job: { leaseId: job.leaseId, owner: job.owner, keys: job.keys as string[] }, blocked: data.blocked }
}

export async function runMediaMaintenance(
  env: MaintenanceEnv,
  fetcher: (input: string, init: RequestInit) => Promise<Response> = fetch,
  observe?: (progress: Readonly<MaintenanceProgress>) => void,
): Promise<void> {
  let progress: MaintenanceProgress = { phase: "configuration", outcome: "running", planned: 0, retired: 0 }
  const report = (update: Partial<MaintenanceProgress>) => {
    progress = { ...progress, ...update }
    // La instrumentación no debe impedir ni repetir una operación de mantenimiento.
    try { observe?.({ ...progress }) } catch { /* Sin datos de terceros en logs. */ }
  }
  report({})
  if (env.ENABLE_MEDIA_MAINTENANCE !== "true") { report({ outcome: "disabled" }); return }
  const cfg = settings(env)
  if (!cfg) throw new Error("Media maintenance is not configured")
  const call = async (action: "claim" | "retire" | "finish", extra: Record<string, unknown> = {}): Promise<unknown> => {
    const payload = { version: 1, keyId: cfg.keyId, issuedAt: Math.floor(Date.now() / 1000), nonce: crypto.randomUUID(), action, ...extra }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetcher(`${cfg.endpoint}/rest/v1/rpc/run_media_maintenance`, {
        // workerd admite manual/follow: manual conserva las credenciales en este
        // destino y response.ok rechaza cualquier redirección sin seguirla.
        method: "POST", signal: controller.signal, redirect: "manual",
        headers: { "content-type": "application/json", apikey: cfg.anon, authorization: `Bearer ${cfg.anon}` },
        body: JSON.stringify({ p_payload: JSON.stringify(payload), p_signature: await signature(cfg.key, payload) }),
      })
      if (!response.ok) throw new Error("Media maintenance failed")
      const body = await response.json()
      if (action !== "claim" && (!body || typeof body !== "object" || (body as Record<string, unknown>).ok !== true)) throw new Error("Media maintenance failed")
      return body
    } catch { throw new Error("Media maintenance failed") } finally { clearTimeout(timer) }
  }
  report({ phase: "claim" })
  const { job, blocked } = parseClaim(await call("claim"))
  if (!job) {
    if (blocked) { report({ phase: "blocked" }); throw new Error("Media maintenance failed") }
    report({ outcome: "idle" })
    return
  }
  report({ planned: job.keys.length })
  for (const key of job.keys) {
    try {
      report({ phase: "storage" })
      const result = await cfg.bucket.put(key, new Uint8Array(0), { customMetadata: { estado: "retirado" }, httpMetadata: { cacheControl: "no-store" } })
      if (!result || result.size !== 0 || typeof result.etag !== "string" || result.etag.length < 1 || result.etag.length > 200) throw new Error("Media maintenance failed")
      report({ phase: "retire" })
      await call("retire", { leaseId: job.leaseId, key, bytes: result.size, etag: result.etag })
      report({ retired: progress.retired + 1 })
    } catch { throw new Error("Media maintenance failed") }
  }
  report({ phase: "finish" })
  await call("finish", { leaseId: job.leaseId })
  report({ outcome: "completed" })
}

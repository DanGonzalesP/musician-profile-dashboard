import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createClient } from "@supabase/supabase-js"
import type { ResultadoRateLimit } from "./rate-limit"

export type AnonymousBucket = "oembed" | "health"
const DENIED = { permitido: false, restantes: 0, reintentarEn: 60, unavailable: true } as const
const SIGNING_DOMAIN = "vibe-anonymous-rate-limit\n"

/** IPv6 comparte /64: rotar direcciones de privacidad no renueva el cupo. */
export function normalizeNetworkIdentity(raw: string): string | null {
  const value = raw.trim()
  const family = isIP(value)
  if (family === 4) return `ipv4:${value}`
  if (family !== 6 || value.includes("%")) return null
  const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1)
  if (canonical.startsWith("::ffff:")) {
    const parts = canonical.slice(7).split(":").map(v => Number.parseInt(v, 16))
    if (parts.length === 2) return `ipv4:${parts[0] >> 8}.${parts[0] & 255}.${parts[1] >> 8}.${parts[1] & 255}`
  }
  const [left, right] = canonical.split("::")
  const first = left ? left.split(":") : []
  const last = right ? right.split(":") : []
  const all = right === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill("0"), ...last]
  return `ipv6:${all.slice(0, 4).map(v => Number.parseInt(v, 16).toString(16)).join(":")}::/64`
}

export function anonymousRequestIdentity(request: Request): string {
  // TRUSTED_PROXY por sí solo no acredita el runtime. Next local/orígenes
  // directos no pueden obtener cubos nuevos enviando cabeceras Cloudflare.
  if (process.env.NODE_ENV !== "production" || process.env.TRUSTED_PROXY !== "true") return "network:unknown"
  try {
    if (!getCloudflareContext().cf?.colo) return "network:unknown"
  } catch { return "network:unknown" }
  // Nunca caer a X-Forwarded-For/X-Real-IP. En Cloudflare los subrequests de
  // otra zona comparten IP; los Workers de la propia zona son frontera confiada.
  return normalizeNetworkIdentity(request.headers.get("cf-connecting-ip") ?? "") ?? "network:unknown"
}

export function signAnonymousLimit(bucket: AnonymousBucket, identity: string, secret: string, keyId: string) {
  if (!/^[0-9a-f]{64}$/i.test(secret) || !/^[a-zA-Z0-9_-]{1,100}$/.test(keyId)) {
    throw new Error("Límite anónimo sin configurar")
  }
  const key = Buffer.from(secret, "hex")
  // No enviar ni guardar la IP. El HMAC impide enumerar sus hashes sin la clave.
  const subject = createHmac("sha256", key).update(`vibe-network\n${identity}`).digest("hex")
  const p_payload = JSON.stringify({ version: 1, keyId, bucket, subject, issuedAt: Math.floor(Date.now() / 1000) })
  const p_signature = createHmac("sha256", key).update(SIGNING_DOMAIN + p_payload).digest("hex")
  return { p_payload, p_signature }
}

export async function checkAnonymousRateLimit(request: Request, bucket: AnonymousBucket): Promise<ResultadoRateLimit & { unavailable?: boolean }> {
  try {
    const proof = signAnonymousLimit(bucket, anonymousRequestIdentity(request),
      process.env.ANONYMOUS_RATE_LIMIT_KEY ?? "", process.env.ANONYMOUS_RATE_LIMIT_KEY_ID ?? "")
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(3000) }) },
    })
    const { data, error } = await client.rpc("consume_anonymous_rate_limit", proof)
    if (error || !data || typeof data.is_allowed !== "boolean" ||
      !Number.isInteger(data.retry_after) || data.retry_after < 0 || data.retry_after > 60 ||
      !Number.isInteger(data.remaining) || data.remaining < 0 || data.remaining > 60 ||
      (data.is_allowed ? data.retry_after !== 0 : data.retry_after === 0 || data.remaining !== 0)) return { ...DENIED }
    return { permitido: data.is_allowed, restantes: data.remaining, reintentarEn: data.retry_after }
  } catch {
    // Ni excepciones del proveedor, ni IP, ni comprobantes llegan a logs/clientes.
    return { ...DENIED }
  }
}

export function anonymousLimitUnavailable(): Response {
  return Response.json({ error: "Servicio temporalmente no disponible. Inténtalo de nuevo en un momento." }, {
    status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  })
}

import { createHmac } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { anonymousRequestIdentity } from "./anonymous-rate-limit"
import type { ReportInput } from "./report-schema"

export function signAnonymousReport(report: ReportInput, identity: string, secret: string, keyId: string) {
  if (!/^[0-9a-f]{64}$/i.test(secret) || !/^[a-zA-Z0-9_-]{1,100}$/.test(keyId)) throw new Error("Servicio no configurado")
  const key = Buffer.from(secret, "hex")
  const subject = createHmac("sha256", key).update(`vibe-network\n${identity}`).digest("hex")
  const p_payload = JSON.stringify({ version: 1, keyId, subject, issuedAt: Math.floor(Date.now() / 1000), report })
  const p_signature = createHmac("sha256", key).update("vibe-anonymous-report\n" + p_payload).digest("hex")
  return { p_payload, p_signature }
}

export async function submitAnonymousReport(request: Request, report: ReportInput): Promise<"accepted" | "unavailable" | { retryAfter: number }> {
  try {
    const proof = signAnonymousReport(report, anonymousRequestIdentity(request),
      process.env.ANONYMOUS_RATE_LIMIT_KEY ?? "", process.env.ANONYMOUS_RATE_LIMIT_KEY_ID ?? "")
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000) }) },
    })
    const { data, error } = await client.rpc("submit_anonymous_report", proof)
    if (error) return "unavailable"
    if (data?.accepted === true && data.retry_after === 0) return "accepted"
    if (data?.accepted === false && [3600, 86400].includes(data.retry_after)) return { retryAfter: data.retry_after }
    return "unavailable"
  } catch { return "unavailable" }
}

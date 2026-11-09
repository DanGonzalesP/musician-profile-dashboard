import { readJsonObject } from "@/lib/request-json"
import { reportSchema } from "@/lib/report-schema"
import { submitAnonymousReport } from "@/lib/anonymous-report"

const headers = { "Cache-Control": "no-store" }
export async function POST(request: Request) {
  const input = await readJsonObject(request, 16384)
  if (!input.ok) return Response.json({ error: input.status === 413 ? "Reporte demasiado extenso." : input.status === 408 ? "La recepción del reporte tardó demasiado. Inténtalo de nuevo." : "Reporte inválido." }, { status: input.status, headers })
  const parsed = reportSchema.safeParse(input.value)
  if (!parsed.success) return Response.json({ error: "Revisa los datos del reporte y la declaración de derechos." }, { status: 400, headers })
  const result = await submitAnonymousReport(request, parsed.data)
  if (result === "unavailable") return Response.json({ error: "No pudimos recibir el reporte. Inténtalo más tarde." }, { status: 503, headers })
  if (typeof result === "object") return Response.json({ error: "Se alcanzó el límite de reportes. Inténtalo más tarde." }, { status: 429, headers: { ...headers, "Retry-After": String(result.retryAfter) } })
  return Response.json({ accepted: true }, { status: 201, headers })
}

import { readJsonObject } from "@/lib/request-json"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { hasPlatformPermission } from "@/lib/admin"
import { revalidatePath, revalidateTag } from "next/cache"
import { etiquetaPerfil } from "@/lib/supabase-server"
import { logError } from "@/lib/log"

const headers = { "Cache-Control": "no-store" }
const reply = (error: string, status: number) => Response.json({ error }, { status, headers })
async function authorized(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return null
  return await hasPlatformPermission(context.supabase, "moderation") ? context : null
}
export async function GET(request: Request) {
  const context = await authorized(request)
  if (!context) return reply("No tienes permiso para revisar reportes.", 403)
  const url = new URL(request.url)
  const reportId = url.searchParams.get("reportId")
  if (reportId && !/^[0-9a-f-]{36}$/i.test(reportId)) return reply("Consulta inválida.", 400)
  const status = url.searchParams.get("status") ?? "pendiente"
  const offset = Number(url.searchParams.get("offset") ?? 0)
  if (!["pendiente", "en_revision", "aceptado", "rechazado"].includes(status) || !Number.isInteger(offset) || offset < 0 || offset > 10000) return reply("Consulta inválida.", 400)
  const { data, error } = reportId
    ? await context.supabase.rpc("moderation_history", { p_report_id: reportId })
    : await context.supabase.rpc("moderation_queue", { p_status: status, p_offset: offset })
  if (error) return reply("No pudimos consultar los reportes.", 503)
  if (reportId) {
    const reviews = await context.supabase.rpc("moderation_review_requests_v2", { p_report_id: reportId })
    if (reviews.error) return reply("No pudimos consultar las solicitudes de revisión.", 503)
    return Response.json({ rows: data, reviews: reviews.data }, { headers })
  }
  return Response.json({ rows: data }, { headers })
}
export async function POST(request: Request) {
  const context = await authorized(request)
  if (!context) return reply("No tienes permiso para revisar reportes.", 403)
  const input = await readJsonObject(request, 20000)
  if (!input.ok) return reply(input.status === 413 ? "Decisión demasiado extensa." : input.status === 408 ? "La recepción tardó demasiado. Inténtalo de nuevo." : "Decisión inválida.", input.status)
  const body = input.value
  if (body.kind === "review_response") {
    if (typeof body.appealId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.appealId) ||
      typeof body.outcome !== "string" || !["mantenida", "restituida", "revocada", "superada"].includes(body.outcome) ||
      typeof body.response !== "string" || body.response.trim().length < 20 || body.response.trim().length > 4000) {
      return reply("Revisa la respuesta y escribe entre 20 y 4000 caracteres.", 400)
    }
    const result = await context.supabase.rpc("resolve_moderation_review", {
      p_appeal_id: body.appealId, p_outcome: body.outcome, p_response: body.response.trim(),
    })
    if (result.error || result.data?.saved !== true || result.data?.outcome !== body.outcome) {
      return reply("No pudimos confirmar la respuesta. Actualiza el historial antes de repetirla.", result.error?.code === "42501" ? 403 : result.error?.code === "PT409" ? 409 : 503)
    }
    let cacheUpdated = true
    try {
      const username = result.data.username
      if (typeof username === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(username)) {
        revalidateTag(etiquetaPerfil(username), { expire: 0 })
        revalidatePath(`/${username}`)
        revalidatePath(`/${username}/tienda`)
      }
      revalidatePath("/")
      revalidatePath("/sitemap.xml")
    } catch {
      cacheUpdated = false
      logError("/api/admin/reportes", "Invalidación pendiente tras respuesta de revisión", null)
    }
    return Response.json({ saved: true, cacheUpdated }, { headers })
  }
  if (typeof body.reportId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.reportId) ||
    !Number.isSafeInteger(body.version) || Number(body.version) < 0 ||
    typeof body.action !== "string" || !["review", "dismiss", "accept", "suspend", "restore"].includes(body.action) ||
    typeof body.note !== "string" || body.note.trim().length < 10 || body.note.trim().length > 4000) return reply("Revisa la decisión y escribe una nota de al menos 10 caracteres.", 400)
  const { data, error } = await context.supabase.rpc("moderate_report", {
    p_report_id: body.reportId, p_expected_version: body.version, p_action: body.action, p_note: body.note.trim(),
  })
  if (error) return reply(error.code === "PT409" ? "El reporte cambió o esta acción ya no corresponde. Actualiza la lista." : "No pudimos aplicar esta decisión.", error.code === "PT409" ? 409 : error.code === "42501" ? 403 : 503)
  const expectedStatus = body.action === "review" ? "en_revision" : body.action === "dismiss" || body.action === "restore" ? "rechazado" : "aceptado"
  if (!data || data.status !== expectedStatus || !Number.isSafeInteger(data.version) ||
    data.version !== Number(body.version) + 1 || typeof data.profileId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(data.profileId)) {
    logError("/api/admin/reportes", "Respuesta de decisión sin confirmación válida", null)
    return reply("No pudimos confirmar la decisión. Consulta el historial antes de repetirla.", 503)
  }
  // La decisión ya está confirmada: un fallo de caché no debe repetirla.
  let cacheUpdated = true
  try {
    if (typeof data?.username === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(data.username)) {
      revalidateTag(etiquetaPerfil(data.username), { expire: 0 })
      revalidatePath(`/${data.username}`)
      revalidatePath(`/${data.username}/tienda`)
    }
    revalidatePath("/")
    revalidatePath("/sitemap.xml")
  } catch {
    cacheUpdated = false
    logError("/api/admin/reportes", "Invalidación de caché pendiente tras decisión guardada", null)
  }
  return Response.json({ saved: true, cacheUpdated }, { headers })
}


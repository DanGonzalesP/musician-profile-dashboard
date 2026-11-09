import { NextResponse } from "next/server"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit"
import { validateUploadRequest } from "@/lib/upload-validation"
import { idDePeticion, logError, logInfo, logWarn } from "@/lib/log"
import { subidasR2Configuradas } from "@/lib/r2-config"
import { limiteCuotaBytes, modoCuota, formatearGb } from "@/lib/cuota-almacenamiento"
import { mediaReceiptsConfigured, signMediaReceipt } from "@/lib/media-receipt"
import { createImmutableUpload } from "@/lib/r2-object-lifecycle"
import { readJsonObject } from "@/lib/request-json"

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

/** Reserva con JWT real y cuota atómica antes de firmar el PUT condicional.
 * No devuelve una URL publicable: el cliente debe finalizar tras subir. */
export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: "Inicia sesión para subir archivos." }, { status: 401 })
    if (!subidasR2Configuradas() || !mediaReceiptsConfigured()) {
      return NextResponse.json({ error: "Las subidas de archivos no están disponibles en este momento." }, { status: 503 })
    }
    const { user, supabase } = auth
    const limite = await checkAuthenticatedRateLimit(supabase, "upload")
    if (!limite.permitido) return respuesta429(limite.reintentarEn)
    const parsed = await readJsonObject(request, 16_384)
    if (!parsed.ok) {
      return NextResponse.json({ error: "Solicitud de subida inválida o demasiado extensa." }, { status: parsed.status })
    }
    const body = parsed.value
    const { profileId, uploadId = crypto.randomUUID() } = body
    const validation = validateUploadRequest({ folder: body.folder, extension: body.extension, contentType: body.contentType, bytes: body.bytes })
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })
    const { folder, contentType, bytes } = validation
    if (typeof uploadId !== "string" || !UUID.test(uploadId) ||
      (profileId != null && (typeof profileId !== "string" || !UUID.test(profileId)))) {
      return NextResponse.json({ error: "Solicitud de subida inválida." }, { status: 400 })
    }
    const key = `${folder}/${user.id}/${uploadId}.${validation.safeExt}`
    const limitBytes = limiteCuotaBytes()
    const quotaMode = modoCuota()
    const { data, error } = await supabase.rpc("reserve_media_upload", signMediaReceipt({
      action: "reserve", actor: user.id, key, bytes, contentType,
      profileId: profileId ?? null, limitBytes, quotaMode,
    }))
    if (error) {
      if (error.code === "PT413") return NextResponse.json({
        error: `No hay espacio disponible dentro del límite de ${formatearGb(limitBytes)}. Revisa tus archivos o inténtalo más tarde.`,
      }, { status: 413 })
      if (error.code === "PT409") return NextResponse.json({ error: "Esta subida ya no está disponible. Revisa tu cuenta e inténtalo de nuevo." }, { status: 409 })
      logError("api/upload-url", "no se pudo reservar la subida", error, { requestId })
      return NextResponse.json({ error: "No se pudo reservar la subida. Inténtalo de nuevo." }, { status: 503 })
    }
    const expiresAt = typeof data?.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN
    // Redondear hacia abajo mantiene la firma dentro del plazo original.
    const expiresIn = Math.min(300, Math.floor((expiresAt - Date.now()) / 1000))
    if (data?.key !== key || !["pending", "ready"].includes(data?.state) || !Number.isFinite(expiresIn)) {
      return NextResponse.json({ error: "No se pudo comprobar la reserva de la subida." }, { status: 503 })
    }
    if (expiresIn < 1) return NextResponse.json({ code: "upload_expired", error: "La reserva de subida venció. Inicia una nueva subida." }, { status: 409 })
    if (data.exceeded === true) logWarn("api/upload-url", "reserva por encima de cuota en observación", { requestId, modo: quotaMode })
    const uploadUrl = await createImmutableUpload(r2Client, R2_BUCKET_NAME, key, contentType, bytes, expiresIn)
    logInfo("api/upload-url", "subida reservada", { requestId, folder, bytes, resultado: "ok" })
    return NextResponse.json({ key, uploadUrl, expiresAt: data.expiresAt,
      headers: { "Content-Type": contentType, "If-None-Match": "*" } })
  } catch (error) {
    logError("api/upload-url", "error al preparar subida", error, { requestId })
    return NextResponse.json({ error: "No se pudo preparar la subida." }, { status: 503 })
  }
}

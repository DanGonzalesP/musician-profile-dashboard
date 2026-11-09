import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { MEDIA_PATH } from "@/lib/media-url"
import { subidasR2Configuradas } from "@/lib/r2-config"
import { mediaReceiptsConfigured, signMediaReceipt } from "@/lib/media-receipt"
import { verifyUploadedObject } from "@/lib/r2-object-lifecycle"
import { idDePeticion, logError } from "@/lib/log"
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit"
import { readJsonObject } from "@/lib/request-json"

export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: "Inicia sesión para completar la subida." }, { status: 401 })
    if (!subidasR2Configuradas() || !mediaReceiptsConfigured()) {
      return NextResponse.json({ error: "Las subidas de archivos no están disponibles en este momento." }, { status: 503 })
    }
    const { supabase, user } = auth
    const limit = await checkAuthenticatedRateLimit(supabase, "upload-finalize")
    if (!limit.permitido) return respuesta429(limit.reintentarEn)
    const parsed = await readJsonObject(request, 16_384)
    if (!parsed.ok) return NextResponse.json({ error: "Solicitud de subida inválida o demasiado extensa." }, { status: parsed.status })
    const key = parsed.value.key
    if (typeof key !== "string" || !/^(images|audio|video)\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{1,10}$/.test(key) || key.split("/")[1] !== user.id) {
      return NextResponse.json({ error: "Archivo de subida inválido." }, { status: 400 })
    }
    // Metadata del inventario con RLS, nunca de lo que afirma el navegador.
    const asset = await supabase.from("media_assets").select("bytes,content_type,owner_user_id").eq("key", key).maybeSingle()
    if (asset.error) return NextResponse.json({ error: "No se pudo comprobar la reserva." }, { status: 503 })
    if (!asset.data || asset.data.owner_user_id !== user.id) return NextResponse.json({ error: "No se encontró la reserva." }, { status: 404 })
    const { bytes, content_type: contentType } = asset.data
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || typeof contentType !== "string") {
      return NextResponse.json({ error: "La reserva no está disponible." }, { status: 409 })
    }
    let verified
    try {
      verified = await verifyUploadedObject(r2Client, R2_BUCKET_NAME, key, { bytes, contentType })
    } catch {
      return NextResponse.json({ error: "No se pudo verificar el archivo. Reintenta completar la subida." }, { status: 409 })
    }
    const finalized = await supabase.rpc("finalize_media_upload", signMediaReceipt({
      action: "finalize", actor: user.id, key, ...verified,
    }))
    if (finalized.error || finalized.data !== true) {
      return NextResponse.json({ error: "No se pudo completar la subida. Revisa tu cuenta e inténtalo de nuevo." },
        { status: finalized.error?.code === "PT409" ? 409 : 503 })
    }
    return NextResponse.json({ publicUrl: `${MEDIA_PATH}${key}` })
  } catch (error) {
    logError("api/finalize-upload", "error al completar subida", error, { requestId })
    return NextResponse.json({ error: "No se pudo completar la subida." }, { status: 503 })
  }
}

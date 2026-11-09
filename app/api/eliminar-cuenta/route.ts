import { continueAccountClosure } from "@/lib/account-media"
import { NextResponse } from "next/server"
import { tombstoneUploadedObject } from "@/lib/r2-object-lifecycle"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { subidasR2Configuradas } from "@/lib/r2-config"
import { mediaReceiptsConfigured } from "@/lib/media-receipt"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit"
import { idDePeticion, logError, logInfo } from "@/lib/log"

export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: "Inicia sesión para eliminar tu cuenta." }, { status: 401 })
    // No congelar una cuenta si este servidor no puede coordinar sus archivos.
    if (!subidasR2Configuradas() || !mediaReceiptsConfigured()) {
      return NextResponse.json({ error: "La eliminación no está disponible en este momento." }, { status: 503 })
    }
    const { user, supabase } = auth
    const limite = await checkAuthenticatedRateLimit(supabase, "account-closure")
    if (!limite.permitido) return respuesta429(limite.reintentarEn)
    const result = await continueAccountClosure(supabase, user.id, key =>
      tombstoneUploadedObject(r2Client, R2_BUCKET_NAME, key))
    logInfo("api/eliminar-cuenta", "avance de eliminación", {
      requestId, archivos: result.archivosRetirados,
      resultado: "ok",
    })
    return NextResponse.json(result, { status: result.eliminada ? 200 : 202 })
  } catch (error) {
    logError("api/eliminar-cuenta", "falló la eliminación", error, { requestId })
    return NextResponse.json({ error: "No se pudo completar la eliminación. Puedes volver a intentarlo." }, { status: 500 })
  }
}

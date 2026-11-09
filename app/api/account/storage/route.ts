import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { limiteCuotaBytes, modoCuota } from "@/lib/cuota-almacenamiento"
import { logError } from "@/lib/log"

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" }
export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: "Inicia sesión para consultar tu almacenamiento." }, { status: 401, headers })
    const { data, error } = await auth.supabase.rpc("read_own_storage_summary")
    const limitBytes = limiteCuotaBytes()
    if (error || !data || ![data.usedBytes, data.pendingBytes, data.unknownFiles, limitBytes].every(value => Number.isSafeInteger(value) && value >= 0) || limitBytes === 0 || data.pendingBytes > data.usedBytes) {
      return NextResponse.json({ error: "No se pudo consultar el almacenamiento." }, { status: 503, headers })
    }
    return NextResponse.json({ usedBytes: data.usedBytes, pendingBytes: data.pendingBytes,
      unknownFiles: data.unknownFiles, limitBytes, enforced: modoCuota() === "rechazar" }, { headers })
  } catch (error) {
    logError("api/account/storage", "falló la consulta del almacenamiento", error)
    return NextResponse.json({ error: "No se pudo consultar el almacenamiento." }, { status: 503, headers })
  }
}

import { NextResponse } from "next/server"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { checkRateLimit, identificarSolicitante, respuesta429 } from "@/lib/rate-limit"
import { idDePeticion, logError, logInfo } from "@/lib/log"

// Borrado de cuenta — derecho de supresión (Ley 29733 art. 20 / GDPR art. 17).
//
// Por qué existe esta ruta además de la función SQL eliminar_mi_cuenta():
// Postgres puede borrar las filas en cascada, pero no puede hablar con
// Cloudflare R2. Si solo se borrara la base, los archivos del usuario
// (fotos, pistas) quedarían huérfanos en el bucket para siempre — que es
// exactamente lo que la ley obliga a no hacer.
//
// El orden importa: PRIMERO los archivos (mientras media_assets todavía dice
// cuáles son), DESPUÉS las filas. Al revés, el inventario desaparecería y no
// habría forma de saber qué borrar.

export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para eliminar tu cuenta." }, { status: 401 })
    }
    const { user, supabase } = auth

    const limite = checkRateLimit(identificarSolicitante(request, user.id), 3, 3600)
    if (!limite.permitido) return respuesta429(limite.reintentarEn)

    // 1. Inventario de archivos. RLS ya restringe esto a los propios.
    const { data: assets, error: assetsError } = await supabase
      .from("media_assets")
      .select("key")

    if (assetsError) {
      logError("api/eliminar-cuenta", "no se pudo listar los archivos del usuario", assetsError, {
        requestId,
        userId: user.id,
      })
      return NextResponse.json(
        { error: "No se pudo preparar la eliminación. Inténtalo de nuevo." },
        { status: 500 }
      )
    }

    // 2. Borrado en R2. Un fallo individual no aborta el proceso: es peor
    // dejar la cuenta a medio borrar que dejar un archivo suelto, y los
    // sobrantes los recoge después /api/cleanup-orphaned-files.
    const fallidos: string[] = []
    for (const asset of assets ?? []) {
      const key = asset.key as string
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
      } catch (err) {
        logError("api/eliminar-cuenta", "fallo al borrar un objeto de R2", err, {
          requestId,
          userId: user.id,
        })
        fallidos.push(key)
      }
    }

    // 3. Borrado de la cuenta. La función SQL elimina la fila de auth.users y
    // el resto cae por los ON DELETE CASCADE ya declarados.
    const { error: rpcError } = await supabase.rpc("eliminar_mi_cuenta")
    if (rpcError) {
      logError("api/eliminar-cuenta", "fallo el borrado en la base", rpcError, {
        requestId,
        userId: user.id,
      })
      return NextResponse.json(
        { error: "No se pudo eliminar la cuenta. Escríbenos y lo hacemos manualmente." },
        { status: 500 }
      )
    }

    // Se registra el hecho (auditoría del derecho de supresión) pero nunca los
    // datos borrados.
    logInfo("api/eliminar-cuenta", "cuenta eliminada", {
      requestId,
      userId: user.id,
      archivos: assets?.length ?? 0,
      fallidos: fallidos.length,
      resultado: "ok",
    })

    return NextResponse.json({
      eliminada: true,
      archivosBorrados: (assets?.length ?? 0) - fallidos.length,
      archivosPendientes: fallidos.length,
    })
  } catch (error) {
    logError("api/eliminar-cuenta", "error inesperado al eliminar la cuenta", error, { requestId })
    return NextResponse.json({ error: "No se pudo eliminar la cuenta." }, { status: 500 })
  }
}

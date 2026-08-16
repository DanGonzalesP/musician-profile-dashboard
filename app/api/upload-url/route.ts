import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit"
import { validateUploadRequest } from "@/lib/upload-validation"
import { idDePeticion, logError, logInfo } from "@/lib/log"

// Genera una URL firmada de subida directa a R2. El archivo NUNCA pasa por
// este servidor/función serverless — el navegador hace el PUT directo a R2
// con la URL que devolvemos acá. Por eso este endpoint solo recibe metadata
// (nombre/tipo de archivo), nunca el archivo en sí, y no hay límite de
// tamaño de body que ajustar en Next.js/Vercel para esto.
//
// Toda la validación (carpeta, tipo, extensión↔MIME, tamaño) vive en
// lib/upload-validation.ts para poder probarla sin red — ver su test.

export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  const inicio = Date.now()
  try {
    // Solo usuarios autenticados pueden pedir URLs de subida. Se usa el
    // contexto autenticado (no solo el user) porque hay que registrar la
    // propiedad del archivo respetando RLS — ver más abajo.
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para subir archivos." }, { status: 401 })
    }
    const { user, supabase } = auth

    // 120 subidas por hora: publicar un álbum con portadas y pistas entra
    // holgado, pero frena un script que quiera llenar el bucket.
    const limite = await checkAuthenticatedRateLimit(supabase, "upload")
    if (!limite.permitido) return respuesta429(limite.reintentarEn)

    const { folder, extension, contentType, bytes, profileId } = await request.json()

    const validation = validateUploadRequest({ folder, extension, contentType, bytes })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { safeExt } = validation

    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

    // Registrar QUIÉN sube QUÉ, antes de entregar la URL firmada. Este
    // registro es lo que después le permite a /api/delete-file autorizar un
    // borrado por propiedad real, en vez de adivinar buscando la URL dentro
    // de un volcado de la base (ver supabase/migrations/0002_media_assets.sql).
    //
    // El insert va con el JWT del usuario, así que la política
    // media_assets_insert_own lo valida contra auth.uid().
    const { error: assetError } = await supabase.from("media_assets").insert({
      key,
      owner_user_id: user.id,
      profile_id: typeof profileId === "string" && profileId ? profileId : null,
      folder,
      content_type: contentType,
      bytes,
    })

    if (assetError) {
      // Si no se puede registrar la propiedad, no se entrega la URL: un
      // archivo sin dueño registrado es un archivo que después nadie puede
      // borrar de forma segura.
      logError("api/upload-url", "no se pudo registrar el archivo en media_assets", assetError, {
        requestId,
        userId: user.id,
        folder,
      })
      return NextResponse.json(
        { error: "No se pudo registrar la subida. ¿Falta correr la migración 0002_media_assets.sql?" },
        { status: 500 }
      )
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: bytes,
    })

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 })
    const publicUrl = `${R2_PUBLIC_URL}/${key}`

    logInfo("api/upload-url", "url de subida firmada", {
      requestId,
      userId: user.id,
      folder,
      bytes,
      duracionMs: Date.now() - inicio,
      resultado: "ok",
    })
    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (error) {
    logError("api/upload-url", "error inesperado al firmar la subida", error, { requestId })
    // Nunca se devuelve error.message crudo: puede filtrar detalles internos
    // (nombres de bucket, credenciales mal configuradas, rutas del servidor).
    return NextResponse.json({ error: "No se pudo generar la URL de subida" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { checkRateLimit, identificarSolicitante, respuesta429 } from "@/lib/rate-limit"

// Genera una URL firmada de subida directa a R2. El archivo NUNCA pasa por
// este servidor/función serverless — el navegador hace el PUT directo a R2
// con la URL que devolvemos acá. Por eso este endpoint solo recibe metadata
// (nombre/tipo de archivo), nunca el archivo en sí, y no hay límite de
// tamaño de body que ajustar en Next.js/Vercel para esto.
const ALLOWED_FOLDERS = new Set(["images", "audio", "video"])

// Solo tipos de archivo multimedia — nunca HTML/JS/ejecutables, aunque el
// bucket sea público: el navegador nunca debe interpretar una subida como
// código. Ahora es OBLIGATORIO: antes, un cliente que simplemente omitiera
// contentType obtenía una URL firmada con application/octet-stream, o sea
// permiso para hospedar cualquier cosa en un bucket público.
const ALLOWED_CONTENT_TYPES = /^(image|audio|video)\//

export async function POST(request: Request) {
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
    const limite = checkRateLimit(identificarSolicitante(request, user.id), 120, 3600)
    if (!limite.permitido) return respuesta429(limite.reintentarEn)

    const { folder, extension, contentType, bytes, profileId } = await request.json()

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "Carpeta de destino inválida" }, { status: 400 })
    }

    if (typeof contentType !== "string" || !ALLOWED_CONTENT_TYPES.test(contentType)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 })
    }

    const safeExt = String(extension ?? "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin"
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
      bytes: typeof bytes === "number" && Number.isFinite(bytes) ? Math.trunc(bytes) : null,
    })

    if (assetError) {
      // Si no se puede registrar la propiedad, no se entrega la URL: un
      // archivo sin dueño registrado es un archivo que después nadie puede
      // borrar de forma segura.
      console.error("[api/upload-url] No se pudo registrar el archivo", assetError)
      return NextResponse.json(
        { error: "No se pudo registrar la subida. ¿Falta correr la migración 0002_media_assets.sql?" },
        { status: 500 }
      )
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 })
    const publicUrl = `${R2_PUBLIC_URL}/${key}`

    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (error: any) {
    console.error("[api/upload-url]", error)
    // Nunca se devuelve error.message crudo: puede filtrar detalles internos
    // (nombres de bucket, credenciales mal configuradas, rutas del servidor).
    return NextResponse.json({ error: "No se pudo generar la URL de subida" }, { status: 500 })
  }
}

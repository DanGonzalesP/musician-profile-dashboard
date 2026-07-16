import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"

// Genera una URL firmada de subida directa a R2. El archivo NUNCA pasa por
// este servidor/función serverless — el navegador hace el PUT directo a R2
// con la URL que devolvemos acá. Por eso este endpoint solo recibe metadata
// (nombre/tipo de archivo), nunca el archivo en sí, y no hay límite de
// tamaño de body que ajustar en Next.js/Vercel para esto.
const ALLOWED_FOLDERS = new Set(["images", "audio"])

export async function POST(request: Request) {
  try {
    const { folder, extension, contentType } = await request.json()

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "Carpeta de destino inválida" }, { status: 400 })
    }

    const safeExt = String(extension ?? "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin"
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: typeof contentType === "string" && contentType ? contentType : "application/octet-stream",
    })

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 })
    const publicUrl = `${R2_PUBLIC_URL}/${key}`

    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (error: any) {
    console.error("[api/upload-url]", error)
    return NextResponse.json({ error: error.message ?? "No se pudo generar la URL de subida" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { createClient } from "@supabase/supabase-js"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedUser } from "@/lib/server-auth"

// Limpieza one-time de archivos huérfanos históricos (ej. mpeg viejos que
// fueron reemplazados por mp3 antes de que la lógica de borrado automático
// existiera). Lee todo R2, identifica qué archivos no aparecen en ningún
// perfil, y los borra con un reporte.

function publicSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión." }, { status: 401 })
    }

    const { folder = "audio" } = await request.json()

    // Listar todos los archivos en la carpeta (ej. "audio/").
    let continuationToken: string | undefined
    const allKeys: string[] = []

    while (true) {
      const listRes = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: `${folder}/`,
          ContinuationToken: continuationToken,
        })
      )

      if (listRes.Contents) {
        allKeys.push(...listRes.Contents.map((obj) => obj.Key!))
      }

      if (!listRes.IsTruncated) break
      continuationToken = listRes.NextContinuationToken
    }

    // Leer TODOS los contenidos de BD (profile_blocks, products, services).
    const supabase = publicSupabase()
    const [{ data: blocks }, { data: products }, { data: services }] = await Promise.all([
      supabase.from("profile_blocks").select("content"),
      supabase.from("products").select("*"),
      supabase.from("services").select("*"),
    ])

    const haystack = JSON.stringify([blocks, products, services])

    // Identificar huérfanos.
    const orphanedKeys: string[] = []
    const inUseKeys: string[] = []

    for (const key of allKeys) {
      const url = `${R2_PUBLIC_URL}/${key}`
      if (haystack.includes(url)) {
        inUseKeys.push(key)
      } else {
        orphanedKeys.push(key)
      }
    }

    // Borrar huérfanos.
    const deleted: string[] = []
    const failed: { key: string; error: string }[] = []

    for (const key of orphanedKeys) {
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
        deleted.push(key)
      } catch (err: any) {
        failed.push({ key, error: err.message ?? String(err) })
      }
    }

    return NextResponse.json({
      folder,
      summary: {
        total: allKeys.length,
        inUse: inUseKeys.length,
        orphaned: orphanedKeys.length,
        deleted: deleted.length,
        failed: failed.length,
      },
      deleted,
      failed,
      inUse: inUseKeys,
    })
  } catch (error: any) {
    console.error("[api/cleanup-orphaned-files]", error)
    return NextResponse.json({ error: error.message ?? "Error en la limpieza" }, { status: 500 })
  }
}

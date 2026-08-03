import { NextResponse } from "next/server"
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { createClient } from "@supabase/supabase-js"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedUser } from "@/lib/server-auth"
import { isAdminUser } from "@/lib/admin"

// Limpieza one-time de archivos huérfanos históricos (ej. mpeg viejos que
// fueron reemplazados por mp3 antes de que la lógica de borrado automático
// existiera). Lee todo R2, identifica qué archivos no aparecen en ningún
// perfil, y los borra con un reporte.
//
// SEGURIDAD — esta ruta BORRA ARCHIVOS EN MASA. Hasta ahora importaba
// getAuthenticatedUser pero nunca lo llamaba, así que cualquiera en internet
// podía vaciar el bucket con un solo curl, y `folder` llegaba sin validar
// (se podía apuntar a cualquier prefijo). Ahora exige sesión + estar en la
// allowlist de ADMIN_USER_IDS, y valida la carpeta.

// Mismas carpetas que acepta /api/upload-url: nunca un prefijo arbitrario.
const ALLOWED_FOLDERS = new Set(["images", "audio", "video"])

function publicSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Lee una tabla COMPLETA, saltando el tope de 1000 filas de PostgREST.
// Si una página falla, se propaga el error: es preferible abortar la limpieza
// a calcular los huérfanos con datos parciales y borrar archivos en uso.
const PAGE_SIZE = 1000

async function fetchAllRows(table: string, columns: string): Promise<unknown[]> {
  const supabase = publicSupabase()
  const rows: unknown[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`)
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  return rows
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para ejecutar la limpieza." }, { status: 401 })
    }
    if (!isAdminUser(user.id)) {
      return NextResponse.json({ error: "No tienes permiso para ejecutar la limpieza." }, { status: 403 })
    }

    const { folder = "audio" } = await request.json()

    if (typeof folder !== "string" || !ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "Carpeta de destino inválida" }, { status: 400 })
    }

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
    //
    // OJO con el "TODOS": PostgREST devuelve como máximo 1000 filas por
    // consulta. La versión anterior hacía un select pelado, así que apenas la
    // tabla pasaba las 1000 filas el "haystack" quedaba incompleto y esta
    // rutina empezaba a considerar huérfanos —y a BORRAR— archivos que sí
    // estaban en uso. Por eso ahora se pagina explícitamente.
    const [blocks, products, services] = await Promise.all([
      fetchAllRows("profile_blocks", "content"),
      fetchAllRows("products", "*"),
      fetchAllRows("services", "*"),
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

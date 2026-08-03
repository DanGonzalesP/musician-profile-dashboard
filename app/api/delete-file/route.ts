import { NextResponse } from "next/server"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"

// Borra de R2 archivos que quedaron huérfanos al publicar (ej. el usuario
// reemplazó una pista o una imagen por otra). Lo llama profile-editor.tsx
// justo después de un publish exitoso, con las URLs que ya nadie referencia.
//
// AUTORIZACIÓN — versión anterior vs. esta:
//
// Antes solo se comprobaba que hubiera sesión y luego, para decidir si borrar,
// se serializaba media base a un string gigante y se buscaba la URL adentro.
// Dos agujeros:
//   1. Cualquier usuario autenticado podía borrar el archivo de CUALQUIER
//      otro con solo conocer su URL — y las URLs son públicas, están en el
//      HTML de cada perfil.
//   2. PostgREST corta en 1000 filas. Pasada esa marca el string quedaba
//      incompleto y el endpoint borraba archivos que sí estaban en uso.
//
// Ahora la pregunta es otra y tiene respuesta exacta: "¿este archivo lo subió
// quien lo está pidiendo?". La responde la tabla media_assets, y la responde
// la BASE (vía RLS con el JWT del usuario), no esta ruta.

const ALLOWED_FOLDERS = new Set(["images", "audio", "video"])

// Tope defensivo: un publish normal deja unos pocos huérfanos.
const MAX_URLS = 100

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para borrar archivos." }, { status: 401 })
    }
    const { supabase } = auth

    const { urls } = await request.json()
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "Lista de URLs inválida" }, { status: 400 })
    }

    // Filtrar a URLs que de verdad apuntan a nuestro bucket y a una carpeta
    // permitida, y quedarnos con la key de R2 de cada una.
    const base = `${R2_PUBLIC_URL}/`
    const candidateKeys = (urls as unknown[])
      .filter((u): u is string => typeof u === "string" && u.startsWith(base))
      .map((u) => u.slice(base.length))
      .filter((key) => ALLOWED_FOLDERS.has(key.split("/")[0]))
      .slice(0, MAX_URLS)

    if (candidateKeys.length === 0) {
      return NextResponse.json({ deleted: [], skipped: urls })
    }

    // La política media_assets_select_own hace que esta consulta devuelva
    // SOLO las filas cuyo owner_user_id sea el usuario del token. O sea que
    // `ownedKeys` es, por construcción, el subconjunto que esta persona tiene
    // derecho a borrar — no hace falta comparar ids a mano.
    const { data: ownedRows, error: ownedError } = await supabase
      .from("media_assets")
      .select("key")
      .in("key", candidateKeys)

    if (ownedError) {
      console.error("[api/delete-file] No se pudo verificar la propiedad", ownedError)
      return NextResponse.json({ error: "No se pudo verificar la propiedad de los archivos" }, { status: 500 })
    }

    const ownedKeys = new Set((ownedRows ?? []).map((row) => row.key as string))

    const deleted: string[] = []
    const skipped: string[] = []

    for (const key of candidateKeys) {
      const url = `${base}${key}`

      // No es tuyo, o es un archivo histórico anterior a media_assets (que no
      // tiene fila). En ambos casos no se toca: es preferible dejar un
      // huérfano ocupando espacio a borrar algo ajeno. Los históricos los
      // limpia /api/cleanup-orphaned-files, que es solo para administradores.
      if (!ownedKeys.has(key)) {
        skipped.push(url)
        continue
      }

      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
        // El registro se borra después del archivo: si R2 falla, la fila
        // sigue ahí y el próximo publish lo vuelve a intentar.
        await supabase.from("media_assets").delete().eq("key", key)
        deleted.push(url)
      } catch (err) {
        console.error("[api/delete-file] Error borrando", key, err)
        skipped.push(url)
      }
    }

    return NextResponse.json({ deleted, skipped })
  } catch (error: any) {
    console.error("[api/delete-file]", error)
    return NextResponse.json({ error: "No se pudo borrar el archivo" }, { status: 500 })
  }
}

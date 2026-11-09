import { NextResponse } from "next/server"
import { tombstoneUploadedObject } from "@/lib/r2-object-lifecycle"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { idDePeticion, logError, logInfo } from "@/lib/log"
import { deleteOwnedMedia } from "@/lib/media-deletion"
import { MEDIA_PATH, mediaKeyFromUrl } from "@/lib/media-url"
import { readJsonObject } from "@/lib/request-json"
import { subidasR2Configuradas } from "@/lib/r2-config"

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

// Tope defensivo: un publish normal deja unos pocos huérfanos.
const MAX_URLS = 100

export async function POST(request: Request) {
  const requestId = idDePeticion(request)
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para borrar archivos." }, { status: 401 })
    }
    const { supabase, user } = auth
    // Fail-closed, igual que upload-url/finalize: sin las cuatro variables S3
    // no se reserva ningún borrado que luego no podría completarse en R2.
    if (!subidasR2Configuradas()) {
      return NextResponse.json({ error: "El borrado de archivos no está disponible en este momento." }, { status: 503 })
    }

    const parsed = await readJsonObject(request, 262_144)
    if (!parsed.ok) return NextResponse.json({ error: "Solicitud de borrado inválida o demasiado extensa." }, { status: parsed.status })
    const { urls } = parsed.value
    if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_URLS ||
      urls.some(url => typeof url !== "string" || url.length > 2048)) {
      return NextResponse.json({ error: "Lista de URLs inválida" }, { status: 400 })
    }

    // Filtrar a URLs que de verdad apuntan a nuestro bucket y a una carpeta
    // permitida, y quedarnos con la key de R2 de cada una.
    const base = R2_PUBLIC_URL ? `${R2_PUBLIC_URL.replace(/\/+$/, "")}/` : MEDIA_PATH
    const candidateKeys = [...new Set((urls as string[])
      .map(u => mediaKeyFromUrl(u, R2_PUBLIC_URL))
      .filter((key): key is string => key !== null))]

    if (candidateKeys.length === 0) {
      return NextResponse.json({ deleted: [], skipped: urls, failed: [] })
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
      logError("api/delete-file", "no se pudo verificar la propiedad", ownedError, {
        requestId,
        userId: user.id,
      })
      return NextResponse.json({ error: "No se pudo verificar la propiedad de los archivos" }, { status: 500 })
    }

    const ownedKeys = new Set((ownedRows ?? []).map((row) => row.key as string))

    const deleted: string[] = []
    const skipped: string[] = []
    const failed: string[] = []

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
        const removed = await deleteOwnedMedia(supabase, key, (ownedKey) =>
          tombstoneUploadedObject(r2Client, R2_BUCKET_NAME, ownedKey), user.id
        )
        // La propiedad por sí sola no basta: el archivo puede seguir en uso
        // en otro perfil, catálogo, feed o borrador, incluso de otra cuenta.
        if (removed) deleted.push(url)
        else skipped.push(url)
      } catch (err) {
        logError("api/delete-file", "fallo al borrar objeto de R2", err, { requestId, userId: user.id })
        skipped.push(url)
        failed.push(url)
      }
    }

    logInfo("api/delete-file", "borrado por propiedad", {
      requestId,
      userId: user.id,
      solicitados: candidateKeys.length,
      borrados: deleted.length,
      omitidos: skipped.length,
      fallidos: failed.length,
      resultado: failed.length > 0 ? "error" : "ok",
    })
    return NextResponse.json({ deleted, skipped, failed })
  } catch (error) {
    logError("api/delete-file", "error inesperado al borrar", error, { requestId })
    return NextResponse.json({ error: "No se pudo borrar el archivo" }, { status: 500 })
  }
}

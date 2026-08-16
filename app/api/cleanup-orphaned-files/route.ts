import { NextResponse } from "next/server"
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedContext } from "@/lib/server-auth"
import { isAdminUser } from "@/lib/admin"
import { clasificarClaves, VENTANA_DE_GRACIA_MS } from "@/lib/cleanup-orphans"
import { logError, logInfo } from "@/lib/log"

// Limpieza de archivos huérfanos de R2. Es la ruta más destructiva del
// proyecto: borra objetos en masa y sin vuelta atrás.
//
// SEGURIDAD — historia de esta ruta, para que no se relaje de nuevo:
//   • Importaba getAuthenticatedUser y nunca lo llamaba: cualquiera vaciaba el
//     bucket con un curl. Hoy exige sesión + allowlist ADMIN_USER_IDS.
//   • `folder` llegaba sin validar y se podía apuntar a cualquier prefijo.
//     Hoy se valida contra el mismo conjunto que acepta /api/upload-url.
//   • El haystack se leía sin paginar y PostgREST corta en 1000 filas, así que
//     pasado ese punto se borraban archivos EN USO. Hoy se pagina.
//   • (P-04) El catch devolvía `error.message` crudo al cliente: era la última
//     ruta que filtraba detalles internos. Hoy devuelve un mensaje genérico y
//     el detalle va al log estructurado del servidor.
//   • (P-05) Tras la migración 0003 los borradores viven en `profile_private`,
//     que el cliente anónimo no puede leer. Un archivo referenciado SOLO desde
//     un borrador se veía como huérfano y se borraba. Hoy el haystack se
//     construye con el cliente autenticado del administrador, incluye
//     `profile_private.draft_content`, y se cruza contra `media_assets` con una
//     ventana de gracia de 7 días. Ver lib/cleanup-orphans.ts.

// Mismas carpetas que acepta /api/upload-url: nunca un prefijo arbitrario.
const ALLOWED_FOLDERS = new Set(["images", "audio", "video"])

// Lee una tabla COMPLETA con el cliente que se le pase, saltando el tope de
// 1000 filas de PostgREST. Si una página falla, se propaga: es preferible
// abortar la limpieza a calcular los huérfanos con datos parciales.
const PAGE_SIZE = 1000

async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<unknown[]> {
  const rows: unknown[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new FuenteIncompleta(table, error.message)
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  return rows
}

/** Una fuente del haystack no se pudo leer entera → la limpieza no puede decidir. */
class FuenteIncompleta extends Error {
  constructor(public readonly fuente: string, public readonly detalle: string) {
    super(`No se pudo leer ${fuente} por completo`)
    this.name = "FuenteIncompleta"
  }
}

type Alcance = "propios" | "todos"

export async function POST(request: Request) {
  const contexto = await getAuthenticatedContext(request)
  if (!contexto) {
    return NextResponse.json({ error: "Inicia sesión para ejecutar la limpieza." }, { status: 401 })
  }
  const { user, supabase } = contexto

  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "No tienes permiso para ejecutar la limpieza." }, { status: 403 })
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 })
  }

  const folder = typeof cuerpo.folder === "string" ? cuerpo.folder : "audio"
  if (!ALLOWED_FOLDERS.has(folder)) {
    return NextResponse.json({ error: "Carpeta de destino inválida" }, { status: 400 })
  }

  // `propios` (por defecto) solo juzga los archivos cuya propiedad el
  // administrador puede verificar. `todos` exige poder leer los borradores de
  // TODOS los perfiles, y aborta si no lo consigue.
  const alcance: Alcance = cuerpo.alcance === "todos" ? "todos" : "propios"
  const incluirSinAtribuir = cuerpo.incluirSinAtribuir === true
  // Ensayo: calcula y reporta exactamente igual, pero no borra nada.
  const simular = cuerpo.simular === true

  if (incluirSinAtribuir && alcance !== "todos") {
    return NextResponse.json(
      { error: "Borrar archivos sin fila de propiedad requiere alcance 'todos'." },
      { status: 400 }
    )
  }

  try {
    // ─── 1) Todo lo que hay en la carpeta ────────────────────────────────
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

      for (const obj of listRes.Contents ?? []) {
        if (obj.Key) allKeys.push(obj.Key)
      }

      if (!listRes.IsTruncated) break
      continuationToken = listRes.NextContinuationToken
    }

    // ─── 2) El haystack, con el cliente AUTENTICADO del administrador ────
    // Con el JWT del admin se ve todo lo público más lo suyo propio. Nunca se
    // usa la service role key: RLS sigue siendo la última palabra, incluso
    // aquí. Si alguna fuente falla, FuenteIncompleta aborta la limpieza entera.
    const [bloques, productos, servicios, borradores] = await Promise.all([
      fetchAllRows(supabase, "profile_blocks", "content"),
      fetchAllRows(supabase, "products", "*"),
      fetchAllRows(supabase, "services", "*"),
      fetchAllRows(supabase, "profile_private", "profile_id, draft_content"),
    ])

    const haystack = JSON.stringify([bloques, productos, servicios, borradores])

    // ─── 3) Comprobación de completitud para el alcance 'todos' ──────────
    // `profile_private` tiene RLS de solo-dueño: el administrador ve SUS
    // borradores, no los de los demás. Antes de juzgar archivos ajenos hay que
    // demostrar que se leyeron todos los borradores; si no, se aborta en vez de
    // borrar con datos parciales.
    if (alcance === "todos") {
      const { data: perfiles, error: errorPerfiles } = await supabase.from("profiles").select("id")
      if (errorPerfiles) throw new FuenteIncompleta("profiles", errorPerfiles.message)

      const visibles = new Set(
        (borradores as { profile_id?: string }[]).map((b) => b.profile_id).filter(Boolean) as string[]
      )
      const sinBorradorLegible = (perfiles ?? []).filter((p: { id: string }) => !visibles.has(p.id))

      if (sinBorradorLegible.length > 0) {
        return NextResponse.json(
          {
            error:
              "Limpieza abortada: no se pudieron leer los borradores de todos los perfiles, " +
              "así que no hay forma de saber si alguno referencia estos archivos. " +
              "Ejecuta la limpieza con alcance 'propios'.",
            perfilesSinBorradorLegible: sinBorradorLegible.length,
            perfilesTotales: perfiles?.length ?? 0,
          },
          { status: 409 }
        )
      }
    }

    // ─── 4) Propiedad de cada archivo (media_assets) ─────────────────────
    const filasActivos = (await fetchAllRows(
      supabase,
      "media_assets",
      "key, created_at, owner_user_id"
    )) as { key: string; created_at: string; owner_user_id: string }[]

    const activos = new Map(filasActivos.map((f) => [f.key, f.created_at]))

    // En modo 'propios' solo se juzgan los archivos del propio administrador.
    // El resto ni se mira: se reporta como fuera de alcance.
    const propios = new Set(
      filasActivos.filter((f) => f.owner_user_id === user.id).map((f) => f.key)
    )
    const fueraDeAlcance = alcance === "propios" ? allKeys.filter((k) => !propios.has(k)) : []
    const candidatas = alcance === "propios" ? allKeys.filter((k) => propios.has(k)) : allKeys

    // ─── 5) Clasificar ───────────────────────────────────────────────────
    const clasificacion = clasificarClaves({
      claves: candidatas,
      urlPublicaBase: R2_PUBLIC_URL,
      haystack,
      activos,
      ahora: Date.now(),
      incluirSinAtribuir,
    })

    // ─── 6) Borrar solo lo que sobrevivió a las tres capas ───────────────
    const deleted: string[] = []
    const failed: { key: string; error: string }[] = []

    if (!simular) {
      for (const key of clasificacion.huerfanas) {
        try {
          await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
          deleted.push(key)
        } catch (err) {
          logError("api/cleanup-orphaned-files", "fallo al borrar objeto de R2", err, {
            userId: user.id,
            folder,
          })
          // El detalle del error de R2 se queda en el log: puede contener el
          // endpoint interno o el nombre del bucket.
          failed.push({ key, error: "No se pudo borrar" })
        }
      }
    }

    logInfo("api/cleanup-orphaned-files", "limpieza ejecutada", {
      userId: user.id,
      folder,
      alcance,
      simular,
      incluirSinAtribuir,
      total: allKeys.length,
      enUso: clasificacion.enUso.length,
      protegidas: clasificacion.protegidasPorGracia.length,
      sinAtribuir: clasificacion.sinAtribuir.length,
      fueraDeAlcance: fueraDeAlcance.length,
      borrados: deleted.length,
      fallidos: failed.length,
    })

    return NextResponse.json({
      folder,
      alcance,
      simular,
      ventanaDeGraciaDias: VENTANA_DE_GRACIA_MS / (24 * 60 * 60 * 1000),
      summary: {
        // Las cinco cifras que la pantalla /cleanup ya muestra. No se renombran.
        total: allKeys.length,
        inUse: clasificacion.enUso.length,
        orphaned: clasificacion.huerfanas.length,
        deleted: deleted.length,
        failed: failed.length,
        // Añadidos: lo que las capas nuevas salvaron del borrado.
        protegidosPorGracia: clasificacion.protegidasPorGracia.length,
        sinAtribuir: clasificacion.sinAtribuir.length,
        fueraDeAlcance: fueraDeAlcance.length,
      },
      deleted,
      failed,
      inUse: clasificacion.enUso,
      protegidosPorGracia: clasificacion.protegidasPorGracia,
      sinAtribuir: clasificacion.sinAtribuir,
    })
  } catch (error) {
    if (error instanceof FuenteIncompleta) {
      logError("api/cleanup-orphaned-files", "fuente del haystack incompleta", error, {
        userId: user.id,
        fuente: error.fuente,
      })
      return NextResponse.json(
        {
          error:
            `Limpieza abortada: no se pudo leer "${error.fuente}" por completo. ` +
            "Calcular los huérfanos con datos parciales borraría archivos en uso.",
        },
        { status: 409 }
      )
    }

    // P-04 — nunca `error.message`: puede traer el endpoint de R2, el nombre
    // del bucket o el detalle de una consulta.
    logError("api/cleanup-orphaned-files", "error inesperado en la limpieza", error, { userId: user.id })
    return NextResponse.json({ error: "Error en la limpieza" }, { status: 500 })
  }
}

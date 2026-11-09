import type { SupabaseClient } from "@supabase/supabase-js"
import { deleteOwnedMedia } from "@/lib/media-deletion"

type ClosureBatch = { keys: string[]; remaining: number; total: number; blocked: boolean }
export type AccountClosureResult = {
  eliminada: boolean
  archivosRetirados: number
  archivosPendientes: number
  requiereRevision: boolean
}

async function readBatch(supabase: SupabaseClient): Promise<ClosureBatch> {
  const { data, error } = await supabase.rpc("get_media_account_closure_batch", { p_limit: 25 })
  if (error || !data || !Array.isArray(data.keys) || data.keys.length > 25
    || data.keys.some((key: unknown) => typeof key !== "string")
    || new Set(data.keys).size !== data.keys.length
    || !Number.isSafeInteger(data.remaining) || data.remaining < 0
    || !Number.isSafeInteger(data.total) || data.total < data.remaining
    || data.keys.length > data.remaining || typeof data.blocked !== "boolean"
    || (!data.blocked && data.remaining > 0 && data.keys.length === 0)) {
    throw new Error("No se pudo comprobar el estado de la eliminación.")
  }
  return data as ClosureBatch
}

/** Cada petición retira como máximo 25 objetos. La base congela primero las
 * escrituras y conserva propiedad y progreso entre peticiones/fallos. */
export async function continueAccountClosure(
  supabase: SupabaseClient,
  actor: string,
  remove: (key: string) => Promise<{ bytes: 0; etag: string }>,
): Promise<AccountClosureResult> {
  const begin = await supabase.rpc("begin_media_account_closure")
  if (begin.error || begin.data !== true) throw new Error("No se pudo iniciar la eliminación.")
  let batch = await readBatch(supabase)
  if (!batch.blocked) {
    for (const key of batch.keys) {
      if (!await deleteOwnedMedia(supabase, key, remove, actor)) {
        throw new Error("No se pudo confirmar la retirada de un archivo.")
      }
    }
    batch = await readBatch(supabase)
  }
  const progress = {
    archivosRetirados: batch.total - batch.remaining,
    archivosPendientes: batch.remaining,
    requiereRevision: batch.blocked,
  }
  if (batch.blocked || batch.remaining > 0) return { eliminada: false, ...progress }
  const finish = await supabase.rpc("eliminar_mi_cuenta")
  if (finish.error) throw new Error("No se pudo completar la eliminación.")
  const exists = await supabase.rpc("media_account_exists")
  if (exists.error || exists.data !== false) throw new Error("No se pudo verificar la eliminación.")
  return { eliminada: true, ...progress }
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { logError } from "@/lib/log"

export type ResultadoRateLimit = {
  permitido: boolean
  restantes: number
  /** Segundos hasta que se libere el cupo. Se manda en Retry-After. */
  reintentarEn: number
}

/**
 * Límite compartido para rutas autenticadas. El contador vive en Postgres y
 * por tanto se mantiene entre instancias serverless. La base fija el cupo y la
 * ventana de cada bucket; el cliente sólo puede escoger un bucket aprobado.
 * Ante cualquier fallo se bloquea la operación sensible durante 60 segundos.
 */
export async function checkAuthenticatedRateLimit(
  supabase: SupabaseClient,
  bucket: "upload" | "upload-finalize" | "image-generation" | "account-closure"
): Promise<ResultadoRateLimit> {
  const { data, error } = await supabase.rpc("consume_authenticated_rate_limit", {
    p_bucket: bucket,
  })

  if (error) {
    logError("rate-limit", "no se pudo consultar el límite compartido", error, {
      resultado: "error",
    })
    // Fail-closed: si el contador distribuido no responde, una ruta que
    // entrega almacenamiento o consume créditos no cae a un Map por instancia.
    return { permitido: false, restantes: 0, reintentarEn: 60 }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.is_allowed !== "boolean" || typeof row.retry_after !== "number") {
    logError("rate-limit", "el límite compartido devolvió una respuesta inválida", undefined, {
      resultado: "error",
    })
    return { permitido: false, restantes: 0, reintentarEn: 60 }
  }
  return {
    permitido: row.is_allowed,
    restantes: row.is_allowed ? 0 : 0,
    reintentarEn: Math.max(0, Math.ceil(row.retry_after)),
  }
}

/** Respuesta 429 estándar, con Retry-After para que un cliente educado espere. */
export function respuesta429(reintentarEn: number): Response {
  return new Response(
    JSON.stringify({ error: "Demasiadas peticiones. Espera un momento e inténtalo de nuevo." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(reintentarEn),
      },
    }
  )
}

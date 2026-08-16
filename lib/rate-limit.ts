import type { SupabaseClient } from "@supabase/supabase-js"
import { logError } from "@/lib/log"

// Limitación de tasa para las rutas de API.
//
// Ninguna ruta tenía límite. Los casos concretos que eso dejaba abiertos:
//   • /api/generate-image consume créditos de pago de Together AI — una sola
//     cuenta gratuita podía agotar el saldo en minutos.
//   • /api/oembed hace fetch a terceros sin autenticación: proxy gratis.
//   • Comentarios, preguntas y registro: spam trivial.
//
// Las operaciones autenticadas consumen el contador distribuido de Postgres
// (migración 0009). Las anónimas conservan una primera barrera local: sin una
// identidad verificable, permitir que el cliente elija la clave de un RPC
// compartido haría el límite trivialmente evadible.

type Ventana = { conteo: number; expiraEn: number }

const contadores = new Map<string, Ventana>()

// Poda perezosa: sin esto el Map crece sin techo con cada identificador
// nuevo, que en un proceso de larga vida es una fuga de memoria.
function podar(ahora: number) {
  if (contadores.size < 5000) return
  for (const [clave, ventana] of contadores) {
    if (ventana.expiraEn <= ahora) contadores.delete(clave)
  }
}

export type ResultadoRateLimit = {
  permitido: boolean
  restantes: number
  /** Segundos hasta que se libere el cupo. Se manda en Retry-After. */
  reintentarEn: number
}

/**
 * @param clave       identificador del solicitante (ver identificarSolicitante)
 * @param maxPeticiones  cuántas se permiten por ventana
 * @param ventanaSegundos duración de la ventana
 */
export function checkRateLimit(
  clave: string,
  maxPeticiones: number,
  ventanaSegundos: number
): ResultadoRateLimit {
  const ahora = Date.now()
  podar(ahora)

  const ventana = contadores.get(clave)

  if (!ventana || ventana.expiraEn <= ahora) {
    contadores.set(clave, { conteo: 1, expiraEn: ahora + ventanaSegundos * 1000 })
    return { permitido: true, restantes: maxPeticiones - 1, reintentarEn: 0 }
  }

  ventana.conteo += 1

  if (ventana.conteo > maxPeticiones) {
    return {
      permitido: false,
      restantes: 0,
      reintentarEn: Math.max(1, Math.ceil((ventana.expiraEn - ahora) / 1000)),
    }
  }

  return { permitido: true, restantes: maxPeticiones - ventana.conteo, reintentarEn: 0 }
}

/**
 * Límite compartido para rutas autenticadas. Cuando la migración 0009 está
 * aplicada, el contador vive en Postgres y por tanto se mantiene entre
 * instancias serverless. `null` conserva el límite local en despliegues que
 * todavía no hayan aplicado la migración.
 */
export async function checkAuthenticatedRateLimit(
  supabase: SupabaseClient,
  bucket: string,
  maxPeticiones: number,
  ventanaSegundos: number
): Promise<ResultadoRateLimit | null> {
  const { data, error } = await supabase.rpc("consume_authenticated_rate_limit", {
    p_bucket: bucket,
    p_limit: maxPeticiones,
    p_window_seconds: ventanaSegundos,
  })

  if (error) {
    // Una instalación anterior a la migración no debe perder la capacidad de
    // subir archivos; usa el control local hasta que se despliegue el esquema.
    if (error.code === "PGRST202") return null
    logError("rate-limit", "no se pudo consultar el límite compartido", error, {
      resultado: "error",
    })
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.is_allowed !== "boolean" || typeof row.retry_after !== "number") return null
  return {
    permitido: row.is_allowed,
    restantes: row.is_allowed ? 0 : 0,
    reintentarEn: Math.max(0, Math.ceil(row.retry_after)),
  }
}

/**
 * ¿Podemos creerle a `x-forwarded-for`?
 *
 * Solo si un proxy de confianza la reescribe en el borde. En Vercel eso pasa
 * siempre y la plataforma expone `VERCEL=1` en el runtime, así que se detecta
 * sola. Fuera de Vercel —local, un contenedor, un servidor propio— la cabecera
 * la manda el cliente y es trivialmente falsificable: el límite por IP se evade
 * mandando un `x-forwarded-for` distinto en cada petición.
 *
 * Fail-closed: por defecto NO se confía. Quien tenga un proxy inverso propio que
 * sanee la cabecera lo declara con `TRUSTED_PROXY=true` (ver `.env.example`).
 *
 * Se lee en cada llamada, no una vez al importar el módulo, para que las
 * pruebas puedan alternar el entorno sin recargar el módulo.
 */
function proxyDeConfianza(): boolean {
  return process.env.VERCEL === "1" || process.env.TRUSTED_PROXY === "true"
}

/**
 * Identifica a quien hace la petición. Se prefiere el id de usuario cuando
 * hay sesión: es mucho más estable que la IP, que se comparte entre todos los
 * clientes detrás de un mismo NAT (una universidad, una oficina, un móvil).
 *
 * Sin proxy de confianza no hay ningún identificador de red honesto disponible
 * a nivel de aplicación, así que todas las peticiones anónimas comparten el
 * cubo `ip:sin-proxy-confiable`. Es deliberado y es la falla segura: prefiere
 * limitar de más a que un atacante se salte el límite con un header. En
 * producción (Vercel) esta rama no se toma nunca.
 */
export function identificarSolicitante(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`

  if (!proxyDeConfianza()) return "ip:sin-proxy-confiable"

  // Con proxy de confianza: el primer valor de x-forwarded-for es el cliente y
  // el resto son los proxies intermedios.
  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconocida"
  return `ip:${ip}`
}

/** Respuesta 429 estándar, con Retry-After para que un cliente educado espere. */
export function respuesta429(reintentarEn: number): Response {
  return new Response(
    JSON.stringify({ error: "Demasiadas peticiones. Espera un momento e inténtalo de nuevo." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(reintentarEn),
      },
    }
  )
}

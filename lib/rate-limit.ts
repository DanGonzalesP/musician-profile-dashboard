// Limitación de tasa para las rutas de API.
//
// Ninguna ruta tenía límite. Los casos concretos que eso dejaba abiertos:
//   • /api/generate-image consume créditos de pago de Together AI — una sola
//     cuenta gratuita podía agotar el saldo en minutos.
//   • /api/oembed hace fetch a terceros sin autenticación: proxy gratis.
//   • Comentarios, preguntas y registro: spam trivial.
//
// IMPLEMENTACIÓN Y SUS LÍMITES — leer antes de confiar en esto:
// El contador vive en memoria del proceso. En Vercel cada función serverless
// es su propia instancia y se recicla, así que el límite real es "por
// instancia", no global: alguien con suficiente paralelismo puede superarlo.
// Sirve para frenar el abuso accidental y el scripting básico, que es la
// mayor parte del problema hoy.
//
// Para un límite de verdad hace falta un contador compartido (Upstash Redis o
// el rate limiting de Vercel). Este módulo expone la misma interfaz que se
// necesitaría entonces, así que cambiarlo es sustituir el cuerpo de
// checkRateLimit, no tocar las rutas.

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
 * Identifica a quien hace la petición. Se prefiere el id de usuario cuando
 * hay sesión: es mucho más estable que la IP, que se comparte entre todos los
 * clientes detrás de un mismo NAT (una universidad, una oficina, un móvil).
 */
export function identificarSolicitante(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`

  // En Vercel la IP real llega en x-forwarded-for; el primer valor es el
  // cliente y el resto son los proxies intermedios.
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

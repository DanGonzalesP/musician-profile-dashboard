import type { SupabaseClient } from "@supabase/supabase-js"
import { logError } from "@/lib/log"

// Cuota de almacenamiento por usuario.
//
// El rate limit de `/api/upload-url` frena la FRECUENCIA (120 subidas por
// hora), no el VOLUMEN. 120 archivos de 200 MB por hora son 24 GB por hora,
// todos dentro del límite. Sin cuota, una sola cuenta puede llenar el bucket y
// la factura de R2 la paga el dueño de la plataforma.
//
// Ante configuración ausente o inválida se exige la cuota. El modo observar
// requiere selección explícita para una ventana operativa controlada; no es
// un límite de gasto y permite reservas por encima del techo.

export const GIGABYTE = 1024 ** 3

/** Cuántos GB por defecto mientras no se configure otra cosa. */
export const CUOTA_POR_DEFECTO_GB = 5

export type ModoCuota = "observar" | "rechazar"

/**
 * Se leen en cada llamada, no una vez al importar el módulo: así las pruebas
 * pueden alternar el entorno sin recargar el módulo, y así un cambio de
 * variable surte efecto sin reconstruir. Mismo criterio que
 * `proxyDeConfianza()` en lib/rate-limit.ts.
 */
export function modoCuota(): ModoCuota {
  return process.env.CUOTA_ALMACENAMIENTO_MODO === "observar" ? "observar" : "rechazar"
}

/**
 * El límite en bytes.
 *
 * Un valor ausente, no numérico, negativo o cero cae al valor por defecto en
 * vez de desactivar la cuota. Es lo contrario de lo que suele hacerse, y es a
 * propósito: `CUOTA_ALMACENAMIENTO_GB=` vacío por un despiste no debe traducirse
 * en "almacenamiento infinito para todos". Ante una configuración rota,
 * se conserva un límite efectivo.
 */
export function limiteCuotaBytes(): number {
  const crudo = Number(process.env.CUOTA_ALMACENAMIENTO_GB)
  const gb = Number.isFinite(crudo) && crudo > 0 ? crudo : CUOTA_POR_DEFECTO_GB
  const bytes = Math.round(gb * GIGABYTE)
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : CUOTA_POR_DEFECTO_GB * GIGABYTE
}

export type DecisionCuota = {
  /** Si la subida puede seguir adelante. En modo observación, siempre true. */
  permitido: boolean
  /** True si el límite se superó, INDEPENDIENTEMENTE del modo. Es lo que se registra. */
  excede: boolean
  usadoBytes: number
  limiteBytes: number
  /** Lo que quedaría libre. Nunca negativo: no existe "menos que vacío". */
  restanteBytes: number
}

/**
 * Decide si una subida cabe.
 *
 * `permitido` y `excede` son campos SEPARADOS y esa es la pieza clave del
 * diseño: en modo observación `excede` puede ser true mientras `permitido`
 * sigue siendo true. Un solo booleano obligaría a quien llama a recalcular la
 * condición para poder registrarla, y ahí es donde las dos ramas se van
 * separando con el tiempo hasta que el registro deja de describir la decisión.
 *
 * Se cuentan los bytes PEDIDOS antes de subir, no después: autorizar primero y
 * medir después permitiría pasarse del límite en cada subida.
 */
export function evaluarCuota(opciones: {
  usadoBytes: number
  bytesPedidos: number
  limiteBytes: number
  modo: ModoCuota
}): DecisionCuota {
  const { usadoBytes, bytesPedidos, limiteBytes, modo } = opciones
  const excede = usadoBytes + bytesPedidos > limiteBytes

  return {
    permitido: modo === "observar" ? true : !excede,
    excede,
    usadoBytes,
    limiteBytes,
    restanteBytes: Math.max(0, limiteBytes - usadoBytes),
  }
}

/**
 * Cuánto ocupa ya quien hace la petición, vía el RPC de la migración `0019`.
 *
 * Devuelve `null` cuando la consulta falla o la respuesta es inválida.
 * Quien llama debe detener la subida antes de registrar o firmar el archivo.
 */
export async function usoDeAlmacenamiento(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc("uso_de_almacenamiento_bytes")

  if (error) {
    logError("cuota-almacenamiento", "no se pudo medir el uso de almacenamiento", error, {
      resultado: "error",
    })
    return null
  }

  const bytes = typeof data === "number" ? data
    : typeof data === "string" && /^\d+$/.test(data) ? Number(data) : NaN
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    logError("cuota-almacenamiento", "el RPC de uso devolvió un valor inesperado", undefined, {
      resultado: "error",
    })
    return null
  }

  return bytes
}

/** Para mensajes de interfaz y registros: bytes → "1.4 GB". */
export function formatearGb(bytes: number): string {
  return `${(bytes / GIGABYTE).toFixed(1)} GB`
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { logError } from "@/lib/log"

// Cuota de almacenamiento por usuario.
//
// El rate limit de `/api/upload-url` frena la FRECUENCIA (120 subidas por
// hora), no el VOLUMEN. 120 archivos de 200 MB por hora son 24 GB por hora,
// todos dentro del límite. Sin cuota, una sola cuenta puede llenar el bucket y
// la factura de R2 la paga el dueño de la plataforma.
//
// ─── ARRANCA EN MODO OBSERVACIÓN, Y ES DELIBERADO ─────────────────────────
// Es el mismo patrón que `lib/blocks-schema.ts` usa para la validación de
// bloques (F3): por defecto REGISTRA lo que habría rechazado y deja pasar.
//
// El motivo es que nadie sabe todavía cuánto ocupa un artista real. Un límite
// inventado y activo tiene un fallo asimétrico: si se queda corto, artistas
// legítimos no pueden subir su disco y se van sin decir nada. Observar primero
// convierte el número en una medición en vez de una corazonada, y el cambio a
// rechazo es una variable de entorno, no un despliegue de código.

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
  return process.env.CUOTA_ALMACENAMIENTO_MODO === "rechazar" ? "rechazar" : "observar"
}

/**
 * El límite en bytes.
 *
 * Un valor ausente, no numérico, negativo o cero cae al valor por defecto en
 * vez de desactivar la cuota. Es lo contrario de lo que suele hacerse, y es a
 * propósito: `CUOTA_ALMACENAMIENTO_GB=` vacío por un despiste no debe traducirse
 * en "almacenamiento infinito para todos". Ante una configuración rota,
 * conviene seguir midiendo.
 */
export function limiteCuotaBytes(): number {
  const crudo = Number(process.env.CUOTA_ALMACENAMIENTO_GB)
  const gb = Number.isFinite(crudo) && crudo > 0 ? crudo : CUOTA_POR_DEFECTO_GB
  return Math.round(gb * GIGABYTE)
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
 * ⚠️ Devuelve `null` cuando la consulta falla, y quien llama debe tratar ese
 * caso como "no se pudo medir" y DEJAR PASAR.
 *
 * Es la falla contraria a la del rate limit, y la asimetría es intencionada:
 * ahí, no poder consultar el contador significa no poder proteger un recurso
 * que cuesta dinero, así que se deniega. Aquí, no poder medir significaría
 * bloquear a un artista legítimo por un fallo NUESTRO —y encima uno que él no
 * puede resolver ni entender—. El costo de dejar pasar una subida de más es
 * unos megas; el de bloquear a alguien que está publicando su disco es que se
 * va.
 */
export async function usoDeAlmacenamiento(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc("uso_de_almacenamiento_bytes")

  if (error) {
    logError("cuota-almacenamiento", "no se pudo medir el uso de almacenamiento", error, {
      resultado: "error",
    })
    return null
  }

  const bytes = typeof data === "number" ? data : Number(data)
  if (!Number.isFinite(bytes) || bytes < 0) {
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

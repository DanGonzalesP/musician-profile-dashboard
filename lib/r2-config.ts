// Comprobación fail-closed de la configuración de subidas a R2.
//
// POR QUÉ EXISTE (F4)
// `lib/r2.ts` lee sus cinco variables con `!`, la aserción de TypeScript que
// promete "esto no es undefined". En runtime esa promesa no vale nada: si
// falta `R2_ENDPOINT`, el `S3Client` se construye con `endpoint: undefined` y
// el fallo aparece recién al firmar, como un 500 opaco. Peor todavía: para
// entonces `upload-url` YA registró la fila en `media_assets`, así que queda
// un archivo inventariado que nunca se subió.
//
// Este módulo se consulta ANTES de tocar nada. Es puro —recibe el entorno como
// argumento— para poder probarlo sin red ni credenciales.
//
// ─── LA OTRA MITAD, QUE NO SE VE ──────────────────────────────────────────
// `R2_ENDPOINT` no sólo firma la subida: también es el origen que
// `lib/csp.ts` mete en `connect-src` para que el navegador pueda hacer el PUT
// directo a R2. Y la CSP se arma en `proxy.ts`, que es Edge middleware: Next
// **incrusta** ahí las variables durante el build. Si `R2_ENDPOINT` no existe
// en el momento del build de Vercel, la CSP sale sin ese origen y el navegador
// bloquea todas las subidas, aunque la variable esté puesta en runtime.
//
// Por eso `R2_ENDPOINT` tiene que estar presente en el ENTORNO DE BUILD de
// Vercel, no sólo en el de ejecución. Ver docs/rotacion-de-credenciales.md.

/** Las cinco variables sin las cuales una subida no puede completarse. */
export const VARIABLES_DE_SUBIDA_R2 = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
] as const

export type VariableDeSubidaR2 = (typeof VARIABLES_DE_SUBIDA_R2)[number]

type Entorno = Record<string, string | undefined>

/**
 * Devuelve los nombres de las variables ausentes o vacías, en orden.
 * Arreglo vacío = la subida puede intentarse.
 *
 * Una cadena de sólo espacios cuenta como ausente: es el resultado típico de
 * pegar mal un valor en el panel de Vercel, y firma igual de mal que no tenerla.
 */
export function variablesDeSubidaAusentes(entorno: Entorno = process.env): VariableDeSubidaR2[] {
  return VARIABLES_DE_SUBIDA_R2.filter((nombre) => !(entorno[nombre] ?? "").trim())
}

/**
 * El origen al que el navegador hace el PUT firmado, derivado de `R2_ENDPOINT`.
 *
 * Es EXACTAMENTE el mismo valor que `lib/csp.ts` mete en `connect-src`: si
 * esta función devuelve `null`, la CSP tampoco lo incluye y el PUT queda
 * bloqueado. Sólo se acepta `https:` — un endpoint en texto plano expondría la
 * firma de la subida.
 */
export function origenDeSubidaR2(entorno: Entorno = process.env): string | null {
  const valor = (entorno.R2_ENDPOINT ?? "").trim()
  if (!valor) return null

  try {
    const url = new URL(valor)
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

/**
 * ¿Puede intentarse una subida con esta configuración?
 *
 * Exige las cinco variables **y** que `R2_ENDPOINT` produzca un origen HTTPS
 * válido. Un endpoint presente pero malformado es peor que uno ausente: pasa
 * la comprobación de presencia y falla al firmar.
 */
export function subidasR2Configuradas(entorno: Entorno = process.env): boolean {
  return variablesDeSubidaAusentes(entorno).length === 0 && origenDeSubidaR2(entorno) !== null
}

// Qué imagen puede usar de fondo la tarjeta social (`opengraph-image`).
//
// POR QUÉ EXISTE — SSRF
// La tarjeta se compone EN EL SERVIDOR, y para pintarla el servidor descarga la
// foto del artista. Esa URL sale del JSONB del bloque hero, que lo escribe el
// propio artista: es entrada de usuario que termina en un `fetch` de nuestra
// infraestructura. Sin filtro, basta guardar
// `hero.image = "http://169.254.169.254/latest/meta-data/"` para que nuestras
// funciones pidan ese recurso desde dentro de la red, sin engañar a nadie.
//
// El criterio es el mismo que ya aplica `/api/image-proxy`, y por el mismo
// motivo: **origen exacto, nunca `startsWith`**. Con `startsWith`, un bucket
// `https://pub-abc.r2.dev` deja pasar `https://pub-abc.r2.dev.atacante.com/x`.
//
// No puede rechazar una foto legítima: el editor sólo produce URLs del bucket
// público (las firma `/api/upload-url` y las sirve `NEXT_PUBLIC_R2_PUBLIC_URL`).
// Lo que descarta es exactamente lo que no debería existir.

/**
 * Devuelve la URL si apunta al bucket público por https, o `undefined` si no.
 *
 * @param url         valor crudo del hero (puede ser cualquier cosa)
 * @param urlPublicaR2 `NEXT_PUBLIC_R2_PUBLIC_URL`. Sin ella no se permite nada:
 *                     sin saber cuál es el origen legítimo, no hay forma de
 *                     distinguirlo de uno hostil. Fail-closed.
 */
export function fotoSocialPermitida(
  url: unknown,
  urlPublicaR2: string | undefined
): string | undefined {
  if (typeof url !== "string" || url.trim() === "") return undefined
  if (!urlPublicaR2) return undefined

  let permitido: string
  try {
    permitido = new URL(urlPublicaR2).origin
  } catch {
    return undefined
  }

  try {
    const objetivo = new URL(url)
    if (objetivo.protocol !== "https:") return undefined
    return objetivo.origin === permitido ? objetivo.toString() : undefined
  } catch {
    // Relativa, `data:`, `javascript:` mal formada, o basura: fuera.
    return undefined
  }
}

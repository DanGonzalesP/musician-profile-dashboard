/**
 * Calcula el hash SHA-256 de un archivo directamente en el navegador (Web
 * Crypto, sin librerías externas) — sirve como huella digital para probar
 * que este archivo exacto existía en un momento dado.
 */
export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

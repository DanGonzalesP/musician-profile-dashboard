/** CORS del PUT firmado: requiere un origen explícito, nunca un comodín. */
export function crearPoliticaCors(sitio) {
  if (typeof sitio !== "string" || !sitio.trim() || sitio.includes("*")) {
    throw new Error("Falta un origen exacto para CORS")
  }
  let url
  try { url = new URL(sitio) } catch { throw new Error("Origen CORS invalido") }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("CORS requiere un origen HTTPS exacto o localhost explicito")
  }
  return {
    CORSRules: [{
      AllowedOrigins: [url.origin],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["Content-Type", "If-None-Match"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 600,
    }],
  }
}

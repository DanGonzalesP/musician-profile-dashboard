// Almacén S3 mínimo y efímero para E2E locales. Las firmas de query se ignoran:
// este fixture NO verifica autenticación R2 y sólo debe usarse en loopback.
import { createServer as createHttpServer } from "node:http"
import { createServer as createHttpsServer } from "node:https"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, if-none-match",
  "access-control-expose-headers": "ETag",
}

/** Crea un servidor con su propio almacén en memoria; no empieza a escuchar. */
export function createR2FixtureServer({ tls } = {}) {
  const objetos = new Map()
  const handle = (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
    if (req.url === "/health" && req.method === "GET") { res.writeHead(200); res.end("ok"); return }
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return }
    let ruta
    try { ruta = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") }
    catch { res.writeHead(400); res.end(); return }
    if (!ruta.includes("/") || ruta.endsWith("/") || ruta.split("/").some(p => p === "..")) {
      res.writeHead(400); res.end(); return
    }
    const key = ruta // Las query de firma se ignoran; nunca se registran.
    if (req.method === "PUT") {
      const chunks = []
      req.on("data", chunk => chunks.push(chunk))
      req.on("end", () => {
        const bytes = Buffer.concat(chunks)
        const length = req.headers["content-length"]
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== bytes.length)) {
          res.writeHead(400); res.end(); return
        }
        // Revisar al completar el cuerpo: otro PUT puede haber escrito mientras
        // esta petición estaba recibiendo datos.
        if (req.headers["if-none-match"] === "*" && objetos.has(key)) { res.writeHead(412); res.end(); return }
        const etag = `"${createHash("md5").update(bytes).digest("hex")}"`
        objetos.set(key, { bytes, type: req.headers["content-type"] ?? "application/octet-stream", etag })
        res.setHeader("ETag", etag); res.writeHead(200); res.end()
      })
      return
    }
    if (req.method === "HEAD" || req.method === "GET") {
      const actual = objetos.get(key)
      if (!actual) { res.writeHead(404); res.end(); return }
      res.setHeader("Content-Type", actual.type)
      res.setHeader("ETag", actual.etag)
      if (req.method === "GET" && req.headers.range !== undefined) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
        const size = actual.bytes.length
        let start, end
        if (!range || (!range[1] && !range[2]) || size === 0) {
          res.setHeader("Content-Range", `bytes */${size}`)
          res.setHeader("Content-Length", "0")
          res.writeHead(416); res.end(); return
        }
        if (!range[1]) {
          const suffix = Number(range[2])
          if (suffix === 0) {
            res.setHeader("Content-Range", `bytes */${size}`)
            res.setHeader("Content-Length", "0")
            res.writeHead(416); res.end(); return
          }
          start = Math.max(0, size - suffix); end = size - 1
        } else {
          start = Number(range[1]); end = range[2] ? Number(range[2]) : size - 1
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
            res.setHeader("Content-Range", `bytes */${size}`)
            res.setHeader("Content-Length", "0")
            res.writeHead(416); res.end(); return
          }
          end = Math.min(end, size - 1)
        }
        const bytes = actual.bytes.subarray(start, end + 1)
        res.setHeader("Accept-Ranges", "bytes")
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`)
        res.setHeader("Content-Length", bytes.length)
        res.writeHead(206); res.end(bytes); return
      }
      res.setHeader("Content-Length", actual.bytes.length)
      res.writeHead(200); res.end(req.method === "GET" ? actual.bytes : undefined); return
    }
    if (req.method === "DELETE") { objetos.delete(key); res.writeHead(204); res.end(); return }
    res.writeHead(405); res.end()
  }
  return tls ? createHttpsServer(tls, handle) : createHttpServer(handle)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const cert = process.env.R2_FIXTURE_TLS_CERT
  const key = process.env.R2_FIXTURE_TLS_KEY
  if (!cert || !key) { process.stderr.write("R2_FIXTURE_TLS_CERT y R2_FIXTURE_TLS_KEY son obligatorios\n"); process.exitCode = 1 }
  else {
    const server = createR2FixtureServer({ tls: { cert: readFileSync(cert), key: readFileSync(key) } })
    server.listen(54998, "127.0.0.1", () => process.stdout.write("Fixture R2 HTTPS listo en loopback\n"))
  }
}

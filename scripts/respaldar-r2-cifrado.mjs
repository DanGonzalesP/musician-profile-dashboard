/** Copia portátil cifrada. No carga .env ni usa credenciales del runtime. */
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { createCipheriv, randomBytes, createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, appendFile, writeFile, rename } from "node:fs/promises"
import { resolve, join, relative, isAbsolute } from "node:path"
import { Transform, Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

if (!args.includes("--execute")) {
  console.log("Preparado para copia cifrada. No se leyó R2 ni se creó un respaldo.")
  console.log("Uso: node scripts/respaldar-r2-cifrado.mjs --execute --account <id> --bucket <nombre> --out .wrangler/backups/<copia-nueva>")
  process.exit(0)
}

let key
let client
let output
let completed = false
try {
  const account = process.env.VIBE_BACKUP_R2_ACCOUNT_ID
  const bucket = process.env.VIBE_BACKUP_R2_BUCKET
  const accessKeyId = process.env.VIBE_BACKUP_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.VIBE_BACKUP_R2_SECRET_ACCESS_KEY
  const keyHex = process.env.VIBE_BACKUP_KEY_HEX
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !bucket || !accessKeyId || !secretAccessKey || !keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("configuration")
  }
  if (option("--account") !== account || option("--bucket") !== bucket) throw new Error("identity")
  const outputArg = option("--out")
  if (!outputArg) throw new Error("destination")
  output = resolve(root, outputArg)
  const base = resolve(root, ".wrangler", "backups")
  const suffix = relative(base, output)
  if (!suffix || suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("destination")
  await mkdir(base, { recursive: true, mode: 0o700 })
  // Directorio nuevo obligatorio: jamás mezclar ni sobrescribir otra copia.
  await mkdir(output, { recursive: false, mode: 0o700 })
  key = Buffer.from(keyHex, "hex")
  client = new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 3 })
  const manifest = { version: 1, source: { account, bucket }, startedAt: new Date().toISOString(),
    completedAt: null, objects: [], consistency: "conditional-get-per-object; not-transactional-snapshot" }
  let continuation
  let totalBytes = 0
  const seenKeys = new Set()
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuation, MaxKeys: 500 }))
    for (const listed of page.Contents ?? []) {
      if (typeof listed.Key !== "string" || !listed.ETag || seenKeys.has(listed.Key)) throw new Error("inventory")
      seenKeys.add(listed.Key)
      // Si cambió entre LIST y GET, detener la copia en vez de atribuirle datos viejos.
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: listed.Key, IfMatch: listed.ETag }))
      if (!object.Body || !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0 || object.ETag !== listed.ETag) throw new Error("object")
      const name = `${randomBytes(24).toString("hex")}.bin`
      const result = await encryptStream(object.Body, join(output, name), key)
      if (result.bytes !== object.ContentLength || (listed.Size !== undefined && result.bytes !== listed.Size)) throw new Error("size")
      totalBytes += result.bytes
      manifest.objects.push({ key: listed.Key, file: name, bytes: result.bytes, sha256: result.sha256,
        etag: object.ETag, lastModified: object.LastModified?.toISOString() ?? null,
        contentType: object.ContentType ?? null, cacheControl: object.CacheControl ?? null,
        contentDisposition: object.ContentDisposition ?? null, contentEncoding: object.ContentEncoding ?? null,
        contentLanguage: object.ContentLanguage ?? null, expires: object.Expires?.toISOString() ?? null,
        metadata: object.Metadata ?? {} })
      // Sólo cantidades: las claves pueden identificar usuarios o contenido privado.
      console.log(`Objetos cifrados: ${manifest.objects.length}; bytes: ${totalBytes}`)
    }
    if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === continuation)) throw new Error("pagination")
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuation)
  manifest.completedAt = new Date().toISOString()
  await encryptStream(Readable.from([Buffer.from(JSON.stringify(manifest))]), join(output, "manifest.bin"), key)
  await writeFile(join(output, "COMPLETE.json"), JSON.stringify({ format: "vibe-r2-aes256gcm-v1", objects: manifest.objects.length,
    bytes: totalBytes, completedAt: manifest.completedAt, restoredAndVerified: false }, null, 2), { flag: "wx", mode: 0o600 })
  completed = true
  console.log("Copia cifrada terminada. Falta custodiarla fuera de esta máquina y demostrar su restauración.")
} catch {
  // No imprimir errores SDK: pueden incluir rutas, nombres de objetos o endpoints.
  console.error("No se completó el respaldo. Comprueba configuración, identidad, permisos, espacio y cambios concurrentes. No uses una carpeta sin COMPLETE.json como copia completa.")
  process.exitCode = 1
} finally {
  key?.fill(0)
  client?.destroy()
  if (output && !completed) console.error("Los fragmentos cifrados se conservan para revisión; no se borró ningún objeto de origen.")
}

/** VBR1 + IV12 + ciphertext + tag16. Hash SHA256 y tamaños dentro del manifiesto cifrado. */
async function encryptStream(source, destination, encryptionKey) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
  const header = Buffer.concat([Buffer.from("VBR1"), iv])
  cipher.setAAD(header)
  const hash = createHash("sha256")
  let bytes = 0
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    hash.update(chunk)
    callback(null, chunk)
  } })
  const temporary = `${destination}.partial`
  await writeFile(temporary, header, { flag: "wx", mode: 0o600 })
  await pipeline(source, meter, cipher, createWriteStream(temporary, { flags: "a" }))
  await appendFile(temporary, cipher.getAuthTag())
  await rename(temporary, destination)
  return { bytes, sha256: hash.digest("hex") }
}

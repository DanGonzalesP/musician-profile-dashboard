/** Restaura sólo en buckets vibe-restore-*. No carga .env ni modifica SQL. */
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readFile, realpath, writeFile } from "node:fs/promises"
import { resolve, join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
if (!args.includes("--execute")) {
  console.log("Sin ejecutar. Uso: --execute --from .wrangler/restores/<carpeta> --source-account <id> --source-bucket <nombre> --account <destino> --bucket vibe-restore-<nombre>")
  process.exit(0)
}

let client
let verified = 0
let bytes = 0
const startedAt = new Date().toISOString()
const fields = { contentType: "ContentType", cacheControl: "CacheControl", contentDisposition: "ContentDisposition",
  contentEncoding: "ContentEncoding", contentLanguage: "ContentLanguage" }

async function localJson(path, maximum) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error("manifest")
  return JSON.parse(await readFile(path, "utf8"))
}

async function digest(stream, expected) {
  const hash = createHash("sha256")
  let count = 0
  try {
    for await (const chunk of stream) {
      count += chunk.length
      if (count > expected.bytes) throw new Error("size")
      hash.update(chunk)
    }
    if (count !== expected.bytes || hash.digest("hex") !== expected.sha256) throw new Error("integrity")
  } finally { stream.destroy?.() }
}

function metadataEqual(actual, expected) {
  const keys = Object.keys(expected)
  return Object.keys(actual).length === keys.length && keys.every(key => actual[key] === expected[key])
}

async function verifyRemote(bucket, entry) {
  const signal = AbortSignal.timeout(300_000)
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }), { abortSignal: signal })
  const abort = () => object.Body?.destroy?.(new Error("timeout"))
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted()
    if (!object.Body || object.ContentLength !== entry.bytes ||
      !metadataEqual(object.Metadata ?? {}, entry.metadata ?? {}) ||
      Object.entries(fields).some(([local, remote]) => (object[remote] ?? null) !== (entry[local] ?? null))) {
      throw new Error("metadata")
    }
    await digest(object.Body, entry)
  } finally { signal.removeEventListener("abort", abort); object.Body?.destroy?.() }
}

try {
  const account = process.env.VIBE_RESTORE_R2_ACCOUNT_ID
  const bucket = process.env.VIBE_RESTORE_R2_BUCKET
  const accessKeyId = process.env.VIBE_RESTORE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.VIBE_RESTORE_R2_SECRET_ACCESS_KEY
  if (!account || !/^[a-f0-9]{32}$/.test(account) || account !== option("--account") ||
    !bucket || !/^vibe-restore-[a-z0-9-]{1,45}[a-z0-9]$/.test(bucket) || bucket !== option("--bucket") ||
    !accessKeyId || !secretAccessKey || !option("--from") || !option("--source-account") || !option("--source-bucket")) throw new Error("configuration")
  const folder = resolve(root, option("--from"))
  if (dirname(folder) !== resolve(root, ".wrangler/restores") || await realpath(folder) !== folder) throw new Error("source")
  const manifest = await localJson(join(folder, "manifest.json"), 64 * 1024 * 1024)
  const marker = await localJson(join(folder, "RECOVERED.json"), 4096)
  if (manifest.version !== 1 || !manifest.completedAt || !Array.isArray(manifest.objects) ||
    marker.format !== "vibe-r2-local-recovery-v1" || marker.authenticatedAndHashed !== true ||
    marker.objects !== manifest.objects.length || manifest.source?.account !== option("--source-account") ||
    manifest.source?.bucket !== option("--source-bucket") ||
    (manifest.source.account === account && manifest.source.bucket === bucket)) throw new Error("identity")
  const entries = new Map()
  const localFiles = new Set()
  let total = 0
  // Comprobar TODOS los archivos antes de la primera escritura remota.
  for (const entry of manifest.objects) {
    if (!entry || typeof entry.key !== "string" || !entry.key || entries.has(entry.key) ||
      !/^[a-f0-9]{48}\.data$/.test(entry.localFile) || localFiles.has(entry.localFile) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("entry")
    if (Object.keys(fields).some(field => entry[field] != null && typeof entry[field] !== "string") ||
      !entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata) ||
      Object.values(entry.metadata).some(value => typeof value !== "string")) throw new Error("metadata")
    const path = join(folder, entry.localFile)
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size !== entry.bytes) throw new Error("file")
    await digest(createReadStream(path), entry)
    total += entry.bytes
    if (!Number.isSafeInteger(total)) throw new Error("size")
    entries.set(entry.key, entry); localFiles.add(entry.localFile)
  }
  if (total !== marker.bytes) throw new Error("size")
  client = new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" })
  const present = new Set()
  let token
  do {
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(30_000) })
    for (const object of list.Contents ?? []) {
      if (!object.Key || !entries.has(object.Key)) throw new Error("unexpected-object")
      present.add(object.Key)
    }
    const next = list.IsTruncated ? list.NextContinuationToken : undefined
    if (list.IsTruncated && (!next || next === token)) throw new Error("pagination")
    token = next
  } while (token)
  for (const entry of entries.values()) {
    if (!present.has(entry.key)) {
      const body = createReadStream(join(folder, entry.localFile))
      try {
        const headers = Object.fromEntries(Object.entries(fields).filter(([local]) => entry[local] != null)
          .map(([local, remote]) => [remote, entry[local]]))
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: entry.key, Body: body,
          ContentLength: entry.bytes, IfNoneMatch: "*", Metadata: entry.metadata ?? {}, ...headers }),
        { abortSignal: AbortSignal.timeout(300_000) })
      } finally { body.destroy() }
    }
    // También valida objetos de una ejecución parcial anterior. Nunca los reemplaza.
    await verifyRemote(bucket, entry)
    verified += 1; bytes += entry.bytes
    console.log(`Objetos cotejados: ${verified}; bytes: ${bytes}`)
  }
  await writeFile(join(folder, `R2-RESTORED-${Date.now()}.json`), JSON.stringify({
    format: "vibe-r2-isolated-restore-v1", startedAt, completedAt: new Date().toISOString(),
    target: { account, bucket },
    objects: verified, bytes, sha256AndMetadataCompared: true,
    databaseReconciled: false, applicationRecoveryVerified: false,
  }, null, 2), { flag: "wx", mode: 0o600 })
  console.log("Copia aislada cotejada. No se cambió la aplicación ni se conciliaron filas de propiedad.")
} catch {
  console.error("Restauración incompleta. Comprueba identidad, integridad, permisos y destino aislado. Los objetos ya escritos se conservan; no se borró ni sobrescribió ningún objeto.")
  process.exitCode = 1
} finally { client?.destroy() }

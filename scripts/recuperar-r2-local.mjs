/** Recuperación local aislada; nunca conecta con R2 ni carga .env. */
import { createDecipheriv, createHash, randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { open, lstat, mkdir, realpath, writeFile, rename, unlink } from "node:fs/promises"
import { resolve, join, dirname } from "node:path"
import { Readable, Transform, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
if (!args.includes("--execute")) {
  console.log("Recuperación preparada, sin leer ni descifrar archivos.")
  console.log("Uso: node scripts/recuperar-r2-local.mjs --execute --from <carpeta-cifrada> --out .wrangler/restores/<carpeta-nueva> --account <id> --bucket <nombre>")
  process.exit(0)
}

let key
let output
try {
  const keyHex = process.env.VIBE_BACKUP_KEY_HEX
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("key")
  if (!option("--from") || !option("--out") || !option("--account") || !option("--bucket")) throw new Error("arguments")
  key = Buffer.from(keyHex, "hex")
  const source = await realpath(resolve(root, option("--from")))
  // El manifiesto autenticado es la autoridad; COMPLETE no constituye una firma.
  const chunks = []
  let manifestBytes = 0
  await decrypt(join(source, "manifest.bin"), new Writable({ write(chunk, _encoding, callback) {
    manifestBytes += chunk.length
    if (manifestBytes > 64 * 1024 * 1024) return callback(new Error("manifest-limit"))
    chunks.push(Buffer.from(chunk))
    callback()
  } }))
  const manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (manifest.version !== 1 || !manifest.completedAt || !Array.isArray(manifest.objects)
    || manifest.source?.account !== option("--account") || manifest.source?.bucket !== option("--bucket")) throw new Error("manifest")
  const names = new Set()
  const keys = new Set()
  let expectedBytes = 0
  for (const entry of manifest.objects) {
    if (!entry || typeof entry.file !== "string" || !/^[a-f0-9]{48}\.bin$/.test(entry.file)
      || typeof entry.key !== "string" || !entry.key || keys.has(entry.key) || names.has(entry.file)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
      || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("entry")
    names.add(entry.file)
    keys.add(entry.key)
    expectedBytes += entry.bytes
    if (!Number.isSafeInteger(expectedBytes)) throw new Error("size")
  }
  const base = resolve(root, ".wrangler", "restores")
  output = resolve(root, option("--out"))
  // Sólo un hijo directo nuevo; ninguna ruta del manifiesto se usa como ruta local.
  if (dirname(output) !== base || output === source) throw new Error("destination")
  await mkdir(base, { recursive: true, mode: 0o700 })
  if (await realpath(base) !== base) throw new Error("linked-destination")
  await mkdir(output, { mode: 0o700 })
  const recovered = []
  let bytes = 0
  for (const entry of manifest.objects) {
    const localFile = `${randomBytes(24).toString("hex")}.data`
    const temporary = join(output, `${localFile}.partial`)
    try {
      const result = await decrypt(join(source, entry.file), createWriteStream(temporary, { flags: "wx", mode: 0o600 }), entry.bytes)
      if (result.bytes !== entry.bytes || result.sha256 !== entry.sha256) throw new Error("integrity")
      await rename(temporary, join(output, localFile))
    } catch (error) {
      // Sólo el temporal de esta operación; nunca borra origen ni otros respaldos.
      await unlink(temporary).catch(() => {})
      throw error
    }
    recovered.push({ ...entry, localFile })
    bytes += entry.bytes
    console.log(`Objetos recuperados: ${recovered.length}; bytes: ${bytes}`)
  }
  // Contiene nombres originales y metadatos privados: custodiar como datos personales.
  await writeFile(join(output, "manifest.json"), JSON.stringify({ ...manifest, objects: recovered }, null, 2), { flag: "wx", mode: 0o600 })
  await writeFile(join(output, "RECOVERED.json"), JSON.stringify({ format: "vibe-r2-local-recovery-v1",
    objects: recovered.length, bytes, recoveredAt: new Date().toISOString(),
    authenticatedAndHashed: true, uploadedToR2: false, applicationRecoveryVerified: false }, null, 2), { flag: "wx", mode: 0o600 })
  console.log("Recuperación local terminada. No se subió nada a R2 ni se comprobó la recuperación de la aplicación.")
} catch {
  console.error("Recuperación incompleta. Revisa clave, identidad, formato, integridad, espacio y destino nuevo. No uses una carpeta sin RECOVERED.json como recuperación completa.")
  if (output) console.error("Los archivos ya recuperados pueden contener datos privados; custódialos. El origen no se modificó.")
  process.exitCode = 1
} finally {
  key?.fill(0)
}

async function decrypt(path, destination, expectedBytes) {
  let handle
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size < 32) throw new Error("file")
    if (expectedBytes !== undefined && info.size !== expectedBytes + 32) throw new Error("size")
    handle = await open(path, "r")
    const header = Buffer.alloc(16)
    const tag = Buffer.alloc(16)
    if ((await handle.read(header, 0, 16, 0)).bytesRead !== 16
      || (await handle.read(tag, 0, 16, info.size - 16)).bytesRead !== 16
      || header.subarray(0, 4).toString("ascii") !== "VBR1") throw new Error("header")
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(4))
    decipher.setAAD(header)
    decipher.setAuthTag(tag)
    const hash = createHash("sha256")
    let bytes = 0
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (expectedBytes !== undefined && bytes > expectedBytes) return callback(new Error("size"))
      hash.update(chunk)
      callback(null, chunk)
    } })
    // El objeto vacío también debe autenticar su etiqueta GCM.
    const source = info.size === 32 ? Readable.from([])
      : handle.createReadStream({ start: 16, end: info.size - 17, autoClose: false })
    await pipeline(source, decipher, meter, destination)
    return { bytes, sha256: hash.digest("hex") }
  } catch (error) {
    destination.destroy()
    throw error
  } finally {
    await handle?.close()
  }
}

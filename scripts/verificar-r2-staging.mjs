// Verifica la credencial S3 de staging sin imprimirla: acceso de objeto sólo en
// vibe-staging-artist-media y rechazo en producción y en los buckets internos.
// Lee R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY del entorno del proceso (los fija
// scripts/guardar-credencial-r2-staging.ps1 en memoria) y escribe un objeto de
// prueba sin datos personales que borra a continuación.
import { randomUUID } from "node:crypto"
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3"

const ACCOUNT = "5b647e532f3d4996206529d5595295f3"
const ALLOWED = "vibe-staging-artist-media"
const FORBIDDEN = [
  "vibe-artist-media", "vibe-cache-incremental", "vibe-static-assets",
  "vibe-staging-cache-incremental", "vibe-staging-static-assets",
]
const { R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
if (!accessKeyId || !secretAccessKey) {
  console.error(JSON.stringify({ verificationFailed: true, reason: "credencial ausente" }))
  process.exit(1)
}
const client = new S3Client({
  region: "auto", endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey },
})
const status = (error) => error?.$metadata?.httpStatusCode ?? null
const key = `images/verificacion-credencial/${randomUUID()}.txt`
const body = `verificacion staging ${new Date().toISOString()}`
let written = false
try {
  await client.send(new ListObjectsV2Command({ Bucket: ALLOWED, MaxKeys: 1 }))
  await client.send(new PutObjectCommand({ Bucket: ALLOWED, Key: key, Body: body, ContentType: "text/plain", IfNoneMatch: "*" }))
  written = true
  const head = await client.send(new HeadObjectCommand({ Bucket: ALLOWED, Key: key }))
  const read = await (await client.send(new GetObjectCommand({ Bucket: ALLOWED, Key: key }))).Body.transformToString()
  if (head.ContentLength !== Buffer.byteLength(body) || read !== body) throw new Error("lectura no coincide")
  await client.send(new DeleteObjectCommand({ Bucket: ALLOWED, Key: key }))
  written = false
  const denied = []
  for (const bucket of FORBIDDEN) {
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
      throw Object.assign(new Error("alcance excesivo"), { excessive: bucket })
    } catch (error) {
      if (error.excessive) throw error
      if (![401, 403].includes(status(error))) throw error
      denied.push(bucket)
    }
  }
  console.log(JSON.stringify({ authorizedBucket: ALLOWED, listPutHeadGetDelete: true, otherBucketsDenied: denied }))
} catch (error) {
  console.error(JSON.stringify({ verificationFailed: true, status: status(error), excessiveBucket: error?.excessive ?? null }))
  process.exitCode = 1
} finally {
  if (written) {
    await client.send(new DeleteObjectCommand({ Bucket: ALLOWED, Key: key })).catch(() => {
      console.error(JSON.stringify({ cleanupPending: key }))
    })
  }
}

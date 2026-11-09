import {
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const INVALID_OBJECT = "El objeto subido no es válido"
const OPERATION_FAILED = "No se pudo completar la operación de almacenamiento"
const VALID_ETAG = /^(?:[a-f0-9]{32}(?:-\d+)?|"[a-f0-9]{32}(?:-\d+)?")$/i

function validEtag(etag: string | undefined): etag is string {
  return typeof etag === "string" && VALID_ETAG.test(etag)
}

export async function createImmutableUpload(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  bytes: number,
  expiresIn: number,
): Promise<string> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) {
    throw new Error(OPERATION_FAILED)
  }
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: bytes,
      IfNoneMatch: "*",
    })
    return await getSignedUrl(client, command, {
      expiresIn,
      signableHeaders: new Set(["if-none-match", "content-type", "content-length"]),
    })
  } catch {
    throw new Error(OPERATION_FAILED)
  }
}

export async function verifyUploadedObject(
  client: S3Client,
  bucket: string,
  key: string,
  expected: { bytes: number; contentType: string },
): Promise<{ bytes: number; contentType: string; etag: string }> {
  let result
  try {
    result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  } catch {
    throw new Error(INVALID_OBJECT)
  }

  const bytes = result.ContentLength
  const contentType = result.ContentType
  const etag = result.ETag
  if (
    bytes !== expected.bytes ||
    contentType !== expected.contentType ||
    !validEtag(etag)
  ) {
    throw new Error(INVALID_OBJECT)
  }
  return { bytes, contentType, etag }
}

export async function tombstoneUploadedObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<{ bytes: 0; etag: string }> {
  let result
  try {
    result = await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(0),
      ContentLength: 0,
      ContentType: "application/octet-stream",
      CacheControl: "no-store",
      Metadata: { estado: "retirado" },
    }))
  } catch {
    throw new Error(OPERATION_FAILED)
  }
  if (!validEtag(result.ETag)) throw new Error(OPERATION_FAILED)
  return { bytes: 0, etag: result.ETag }
}

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { expect, it, vi } from "vitest"
import {
  createImmutableUpload,
  tombstoneUploadedObject,
  verifyUploadedObject,
} from "./r2-object-lifecycle"

const etag = '"0123456789abcdef0123456789abcdef"'

function client(send: (command: unknown) => unknown): S3Client {
  return { send: vi.fn(send) } as unknown as S3Client
}

it("firma una carga con condición de creación y los tres headers obligatorios", async () => {
  const signer = new S3Client({
    region: "auto",
    endpoint: "https://account.r2.cloudflarestorage.com",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" },
  })
  const url = new URL(await createImmutableUpload(signer, "bucket", "key", "audio/mpeg", 42, 60))
  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")?.split(";")
  expect(signedHeaders).toEqual(expect.arrayContaining(["if-none-match", "content-type", "content-length"]))
  expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/)
  expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false)
})

it("verifica tamaño, tipo y ETag desde HEAD", async () => {
  const s3 = client(() => ({ ContentLength: 42, ContentType: "audio/mpeg", ETag: etag }))
  await expect(verifyUploadedObject(s3, "bucket", "key", { bytes: 42, contentType: "audio/mpeg" }))
    .resolves.toEqual({ bytes: 42, contentType: "audio/mpeg", etag })
  expect((s3.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand)
})

it.each([
  { ContentLength: 41, ContentType: "audio/mpeg", ETag: etag },
  { ContentLength: 42, ContentType: "text/plain", ETag: etag },
  { ContentLength: 42, ContentType: "audio/mpeg", ETag: "not-an-etag" },
  { ContentLength: 42, ContentType: "audio/mpeg", ETag: '"0123456789abcdef0123456789abcdef' },
])("rechaza los metadatos inválidos de HEAD", async response => {
  await expect(verifyUploadedObject(client(() => response), "bucket", "key", { bytes: 42, contentType: "audio/mpeg" }))
    .rejects.toThrow("El objeto subido no es válido")
})

it("no firma una autorización vencida ni extiende el plazo de 300 segundos", async () => {
  const s3 = client(() => undefined)
  for (const expiresIn of [0,-1,301,1.5]) {
    await expect(createImmutableUpload(s3,"b","k","audio/mpeg",42,expiresIn)).rejects.toThrow("almacenamiento")
  }
  expect(s3.send).not.toHaveBeenCalled()
})

it("oculta fallos de HEAD y PUT con errores genéricos", async () => {
  await expect(verifyUploadedObject(client(() => { throw new Error("secret") }), "b", "k", { bytes: 1, contentType: "x" }))
    .rejects.toThrow("El objeto subido no es válido")
  await expect(tombstoneUploadedObject(client(() => { throw new Error("secret") }), "b", "k"))
    .rejects.toThrow("No se pudo completar la operación de almacenamiento")
})

it("escribe un tombstone vacío con no-store y metadata de retiro, y devuelve su recibo", async () => {
  const s3 = client(() => ({ ETag: etag }))
  await expect(tombstoneUploadedObject(s3, "bucket", "key")).resolves.toEqual({ bytes: 0, etag })
  const command = (s3.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as PutObjectCommand
  expect(command).toBeInstanceOf(PutObjectCommand)
  expect(command.input).toMatchObject({
    Bucket: "bucket", Key: "key", Body: new Uint8Array(0), ContentLength: 0,
    ContentType: "application/octet-stream", CacheControl: "no-store",
    Metadata: { estado: "retirado" },
  })
})

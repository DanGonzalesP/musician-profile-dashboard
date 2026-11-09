import { afterEach, expect, it, vi } from "vitest"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
it("la firma de subida directa no exige el checksum de un cuerpo vacío", async () => {
  vi.stubEnv("R2_ENDPOINT","https://account.r2.cloudflarestorage.com")
  vi.stubEnv("R2_ACCESS_KEY_ID","test-access")
  vi.stubEnv("R2_SECRET_ACCESS_KEY","test-secret")
  const { r2Client } = await import("./r2")
  const url = new URL(await getSignedUrl(r2Client,new PutObjectCommand({Bucket:"bucket",Key:"audio/test.mp3",
    ContentLength:42,ContentType:"audio/mpeg"}),{expiresIn:60}))
  expect([...url.searchParams.keys()].some(key => key.toLowerCase().startsWith("x-amz-checksum-"))).toBe(false)
  expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false)
  r2Client.destroy()
})

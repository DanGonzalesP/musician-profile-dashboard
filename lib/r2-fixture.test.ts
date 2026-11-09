import { afterAll, beforeAll, expect, it } from "vitest"
import { createHash } from "node:crypto"

let server: import("node:http").Server
let base: string
beforeAll(async () => {
  const { createR2FixtureServer } = await import("../tests/e2e-auth/fixtures/servidor-r2.mjs")
  server = createR2FixtureServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No se obtuvo puerto efímero")
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) })

it("guarda bytes y metadatos, y permite HEAD/GET con ETag MD5", async () => {
  const body = new TextEncoder().encode("contenido fixture")
  const put = await fetch(`${base}/bucket/audio/a.mp3?X-Amz-Signature=omitida`, {
    method: "PUT", headers: { "content-type": "audio/mpeg", "content-length": String(body.length) }, body,
  })
  const etag = `"${createHash("md5").update(body).digest("hex")}"`
  expect(put.status).toBe(200)
  expect(put.headers.get("etag")).toBe(etag)
  const head = await fetch(`${base}/bucket/audio/a.mp3`, { method: "HEAD" })
  expect(head.status).toBe(200)
  expect(head.headers.get("content-length")).toBe(String(body.length))
  expect(head.headers.get("content-type")).toBe("audio/mpeg")
  expect(head.headers.get("etag")).toBe(etag)
  const get = await fetch(`${base}/bucket/audio/a.mp3`)
  expect(new Uint8Array(await get.arrayBuffer())).toEqual(body)
})

it("sirve rangos GET de un tramo y hace que HEAD ignore Range", async () => {
  const key = `${base}/bucket/audio/range`
  const body = new TextEncoder().encode("0123456789")
  expect((await fetch(key, { method: "PUT", body })).status).toBe(200)

  for (const [range, expected, contentRange] of [
    ["bytes=2-5", "2345", "bytes 2-5/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
  ]) {
    const response = await fetch(key, { headers: { range } })
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe(contentRange)
    expect(response.headers.get("content-length")).toBe(String(expected.length))
    expect(await response.text()).toBe(expected)
  }

  const unsatisfiable = await fetch(key, { headers: { range: "bytes=10-" } })
  expect(unsatisfiable.status).toBe(416)
  expect(unsatisfiable.headers.get("content-range")).toBe("bytes */10")

  const head = await fetch(key, { method: "HEAD", headers: { range: "bytes=2-5" } })
  expect(head.status).toBe(200)
  expect(head.headers.get("content-length")).toBe("10")
  expect(head.headers.get("content-range")).toBeNull()
})

it("rechaza sobrescritura condicional y conserva marcador vacío contra PUT tardío", async () => {
  const marker = `${base}/bucket/audio/marker`
  expect((await fetch(marker, { method: "PUT", headers: { "if-none-match": "*", "content-length": "0" } })).status).toBe(200)
  expect((await fetch(marker, { method: "PUT", headers: { "if-none-match": "*", "content-length": "1" }, body: "x" })).status).toBe(412)
  const cors = await fetch(marker, { method: "OPTIONS" })
  expect(cors.headers.get("access-control-allow-headers")).toContain("if-none-match")
  expect(cors.headers.get("access-control-expose-headers")).toContain("ETag")
})

it("serializa PUT condicional concurrentes y no deja que un PUT iniciado antes del marcador lo reemplace", async () => {
  const concurrent = `${base}/bucket/audio/concurrent`
  const results = await Promise.all(["uno", "dos"].map(value => fetch(concurrent, {
    method: "PUT", headers: { "if-none-match": "*" }, body: value,
  })))
  expect(results.map(r => r.status).sort()).toEqual([200, 412])

  const key = `${base}/bucket/audio/slow-marker`
  let release!: () => void
  let started!: () => void
  const bodyStarted = new Promise<void>(resolve => { started = resolve })
  const waitForRelease = new Promise<void>(resolve => { release = resolve })
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode("late"))
      started()
      await waitForRelease
      controller.close()
    },
  })
  const latePut = fetch(key, { method: "PUT", headers: { "if-none-match": "*" }, body: stream, duplex: "half" } as RequestInit)
  await bodyStarted
  const marker = await fetch(key, { method: "PUT", headers: { "if-none-match": "*", "content-length": "0" } })
  expect(marker.status).toBe(200)
  release()
  expect((await latePut).status).toBe(412)
  expect((await fetch(key)).headers.get("content-length")).toBe("0")
})

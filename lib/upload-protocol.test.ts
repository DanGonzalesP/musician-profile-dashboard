import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Protocolo de subida: reserva (/api/upload-url) → PUT condicional firmado →
// finalización verificada (/api/finalize-upload). Cada paso exige la sesión de
// la cuenta que inició el intento y lleva su JWT; el PUT a R2 no lleva JWT.
const OWNER = "00000000-0000-4000-8000-0000000000aa"
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string }; access_token: string } }))
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: session.current }, error: null }) } } }))
import { uploadVerifiedFile } from "./upload-protocol"

const file = new File(["imagen"], "test.webp", { type: "image/webp" })
const UPLOAD_URL = "https://upload.example.invalid/firmado"
type Handler = (init: RequestInit) => Response | Promise<Response>
let reserveQueue: Handler[] = []
let putQueue: Handler[] = []
let finalizeQueue: Handler[] = []
const calls: { url: string; init: RequestInit }[] = []
let reservedKey = ""

const reserveOk: Handler = init => {
  const { uploadId } = JSON.parse(String(init.body))
  reservedKey = `images/${OWNER}/${uploadId}.webp`
  return Response.json({ key: reservedKey, uploadUrl: UPLOAD_URL, headers: { "If-None-Match": "*", "Content-Type": file.type } })
}
const finalizeOk: Handler = () => Response.json({ publicUrl: `/api/media/${reservedKey}` })
const status = (code: number, body: unknown = { error: "detalle interno del servidor" }): Handler => () => Response.json(body, { status: code })
const lost: Handler = () => { throw new TypeError("detalle de red con URL firmada privada") }
const callsTo = (fragment: string) => calls.filter(call => call.url.includes(fragment))

const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, init })
  const queue = url.includes("/api/upload-url") ? reserveQueue : url.includes("/api/finalize-upload") ? finalizeQueue : putQueue
  const handler = queue.length > 1 ? queue.shift()! : queue[0]
  if (!handler) throw new Error(`sin respuesta preparada para ${url}`)
  return handler(init)
})

beforeEach(() => {
  calls.length = 0
  reservedKey = ""
  session.current = { user: { id: OWNER }, access_token: "jwt-propietario" }
  reserveQueue = [reserveOk]
  putQueue = [() => new Response(null, { status: 200 })]
  finalizeQueue = [finalizeOk]
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("recorrido completo", () => {
  it("reserva, sube condicionalmente y sólo devuelve la URL tras finalizar", async () => {
    const url = await uploadVerifiedFile(file, "images")
    expect(url).toBe(`/api/media/${reservedKey}`)
    expect(reservedKey).toMatch(new RegExp(`^images/${OWNER}/[0-9a-f-]{36}\\.webp$`))
    expect(calls.map(call => call.url)).toEqual(["/api/upload-url", UPLOAD_URL, "/api/finalize-upload"])
    const [reserve, put, finalize] = calls
    expect((reserve.init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-propietario")
    expect((finalize.init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-propietario")
    expect(put.init.headers).toEqual({ "Content-Type": file.type, "If-None-Match": "*" })
    expect(put.init.body).toBe(file)
    expect(JSON.parse(String(finalize.init.body))).toEqual({ key: reservedKey })
  })

  it("sin sesión no reserva nada", async () => {
    session.current = null
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("Inicia sesión")
    expect(calls).toEqual([])
  })

  it("si la sesión pasa a otra cuenta antes del PUT, se detiene sin subir", async () => {
    reserveQueue = [init => { session.current = { user: { id: "otra-cuenta" }, access_token: "jwt-ajeno" }; return reserveOk(init) }]
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("La sesión cambió")
    expect(callsTo(UPLOAD_URL)).toHaveLength(0)
    expect(callsTo("/api/finalize-upload")).toHaveLength(0)
  })

  it("rechaza una reserva cuya key no corresponde al intento", async () => {
    reserveQueue = [() => Response.json({ key: `images/${OWNER}/otra.webp`, uploadUrl: UPLOAD_URL, headers: { "If-None-Match": "*", "Content-Type": file.type } })]
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("No se pudo comprobar la reserva")
    expect(callsTo(UPLOAD_URL)).toHaveLength(0)
  })

  it("no acepta una URL final distinta de la key reservada", async () => {
    finalizeQueue = [() => Response.json({ publicUrl: "https://otro.example/archivo.webp" })]
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("No se pudo verificar la subida")
  })
})

describe("reintentos idempotentes", () => {
  it.each([["respuesta perdida", lost], ["503", status(503)]])("reintenta la reserva con el mismo cuerpo ante %s", async (_name, failure) => {
    reserveQueue = [failure, reserveOk]
    expect(await uploadVerifiedFile(file, "images")).toBe(`/api/media/${reservedKey}`)
    const reserves = callsTo("/api/upload-url")
    expect(reserves).toHaveLength(2)
    expect(reserves[0].init.body).toBe(reserves[1].init.body)
    expect(callsTo(UPLOAD_URL)).toHaveLength(1)
  })

  it.each([["respuesta perdida", lost], ["503", status(503)]])("reintenta la finalización de la misma key ante %s", async (_name, failure) => {
    finalizeQueue = [failure, finalizeOk]
    expect(await uploadVerifiedFile(file, "images")).toBe(`/api/media/${reservedKey}`)
    const finals = callsTo("/api/finalize-upload")
    expect(finals).toHaveLength(2)
    expect(finals[0].init.body).toBe(finals[1].init.body)
    expect(callsTo(UPLOAD_URL)).toHaveLength(1)
  })

  it("un PUT con respuesta perdida reusa la condición y verifica el 412 antes de finalizar", async () => {
    putQueue = [lost, () => new Response(null, { status: 412 })]
    expect(await uploadVerifiedFile(file, "images")).toBe(`/api/media/${reservedKey}`)
    const puts = callsTo(UPLOAD_URL)
    expect(puts).toHaveLength(2)
    expect(puts[0].init.headers).toEqual(puts[1].init.headers)
    expect(calls.at(-1)?.url).toBe("/api/finalize-upload")
  })
})

describe("fallos que no publican", () => {
  it("412 no basta: si la finalización no verifica, no hay URL", async () => {
    putQueue = [() => new Response(null, { status: 412 })]
    finalizeQueue = [status(409)]
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("todavía no pudo verificarse")
  })

  it("un PUT rechazado por el almacenamiento sólo comprueba la reserva y no publica", async () => {
    putQueue = [() => new Response(null, { status: 500 })]
    finalizeQueue = [status(409)]
    await expect(uploadVerifiedFile(file, "images")).rejects.toThrow("almacenamiento")
    expect(callsTo(UPLOAD_URL)).toHaveLength(2)
    expect(callsTo("/api/finalize-upload")).toHaveLength(1)
  })

  it("limita los intentos de red del PUT y no filtra sus detalles", async () => {
    putQueue = [lost]
    finalizeQueue = [status(409)]
    const error = await uploadVerifiedFile(file, "images").catch(failure => failure as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("No pudimos confirmar la transferencia")
    expect((error as Error).message).not.toContain("privada")
    expect(callsTo(UPLOAD_URL)).toHaveLength(2)
  })

  it.each([
    [401, "Tu sesión venció"],
    [403, "no tiene permiso"],
    [409, "ya no está disponible"],
    [413, "No hay espacio confirmado"],
    [429, "límite temporal de subidas"],
  ])("no reintenta una reserva rechazada con %i y explica el motivo", async (code, message) => {
    reserveQueue = [status(code)]
    const error = await uploadVerifiedFile(file, "images").catch(failure => failure as Error)
    expect((error as Error).message).toContain(message)
    expect((error as Error).message).not.toContain("detalle interno")
    expect(callsTo("/api/upload-url")).toHaveLength(1)
    expect(callsTo(UPLOAD_URL)).toHaveLength(0)
  })
})

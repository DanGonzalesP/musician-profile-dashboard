import { describe, it, expect, vi, afterEach } from "vitest"
import { checkRateLimit, checkAuthenticatedRateLimit, identificarSolicitante } from "./rate-limit"
import type { SupabaseClient } from "@supabase/supabase-js"

// Cada prueba usa una clave única para no chocar con el Map compartido del
// módulo (el contador vive en memoria del proceso, a propósito).
let n = 0
const clave = () => `test:${Date.now()}:${n++}`

afterEach(() => {
  vi.useRealTimers()
})

describe("checkRateLimit — contador local en memoria", () => {
  it("permite hasta el máximo y luego bloquea con Retry-After", () => {
    const k = clave()
    const r1 = checkRateLimit(k, 3, 3600)
    expect(r1).toMatchObject({ permitido: true, restantes: 2 })

    expect(checkRateLimit(k, 3, 3600).permitido).toBe(true) // 2ª
    expect(checkRateLimit(k, 3, 3600).permitido).toBe(true) // 3ª

    const bloqueado = checkRateLimit(k, 3, 3600) // 4ª supera el límite
    expect(bloqueado.permitido).toBe(false)
    expect(bloqueado.restantes).toBe(0)
    expect(bloqueado.reintentarEn).toBeGreaterThan(0)
  })

  it("libera el cupo cuando la ventana expira", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const k = clave()

    expect(checkRateLimit(k, 1, 60).permitido).toBe(true)
    expect(checkRateLimit(k, 1, 60).permitido).toBe(false) // dentro de la ventana

    vi.advanceTimersByTime(61_000) // pasa la ventana de 60 s
    expect(checkRateLimit(k, 1, 60).permitido).toBe(true) // ventana nueva
  })

  it("cuenta cada clave por separado", () => {
    const a = clave()
    const b = clave()
    expect(checkRateLimit(a, 1, 60).permitido).toBe(true)
    expect(checkRateLimit(a, 1, 60).permitido).toBe(false)
    // b no se ve afectada por el consumo de a.
    expect(checkRateLimit(b, 1, 60).permitido).toBe(true)
  })
})

describe("identificarSolicitante", () => {
  const req = (headers: Record<string, string>) => new Request("https://x", { headers })

  // El entorno decide si x-forwarded-for es creíble (P-07). Cada bloque de
  // abajo fija el suyo y lo restaura, para que el orden de las pruebas no
  // importe.
  const entornoOriginal = { VERCEL: process.env.VERCEL, TRUSTED_PROXY: process.env.TRUSTED_PROXY }
  afterEach(() => {
    process.env.VERCEL = entornoOriginal.VERCEL
    process.env.TRUSTED_PROXY = entornoOriginal.TRUSTED_PROXY
  })
  function sinProxy() {
    delete process.env.VERCEL
    delete process.env.TRUSTED_PROXY
  }

  it("prefiere el id de usuario cuando hay sesión, con o sin proxy de confianza", () => {
    sinProxy()
    expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4" }), "u-9")).toBe("user:u-9")
    process.env.VERCEL = "1"
    expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4" }), "u-9")).toBe("user:u-9")
  })

  describe("con proxy de confianza", () => {
    it("cae a la primera IP de x-forwarded-for cuando es anónimo (VERCEL=1)", () => {
      process.env.VERCEL = "1"
      expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("ip:1.2.3.4")
    })

    it("también con TRUSTED_PROXY=true fuera de Vercel", () => {
      sinProxy()
      process.env.TRUSTED_PROXY = "true"
      expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("ip:1.2.3.4")
    })

    it("usa x-real-ip si no hay forwarded, y un marcador si no hay nada", () => {
      process.env.VERCEL = "1"
      expect(identificarSolicitante(req({ "x-real-ip": "9.9.9.9" }))).toBe("ip:9.9.9.9")
      expect(identificarSolicitante(req({}))).toBe("ip:desconocida")
    })
  })

  describe("sin proxy de confianza (P-07)", () => {
    it("IGNORA x-forwarded-for: la cabecera la manda el cliente y es falsificable", () => {
      sinProxy()
      expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("ip:sin-proxy-confiable")
    })

    it("ignora también x-real-ip", () => {
      sinProxy()
      expect(identificarSolicitante(req({ "x-real-ip": "9.9.9.9" }))).toBe("ip:sin-proxy-confiable")
    })

    it("un atacante que rota la cabecera NO consigue cubos distintos", () => {
      sinProxy()
      const claves = new Set(
        ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((ip) => identificarSolicitante(req({ "x-forwarded-for": ip })))
      )
      // Antes de P-07 esto daba 3 cubos y el límite por IP era decorativo.
      expect(claves.size).toBe(1)
    })

    it("no confía en un TRUSTED_PROXY que no sea exactamente 'true'", () => {
      sinProxy()
      for (const valor of ["1", "yes", "TRUE", ""]) {
        process.env.TRUSTED_PROXY = valor
        expect(identificarSolicitante(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("ip:sin-proxy-confiable")
      }
    })
  })
})

// Fabrica un cliente de Supabase falso cuyo .rpc() devuelve lo que se le diga.
function fakeSupabase(rpcResult: { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as unknown as SupabaseClient
}

describe("checkAuthenticatedRateLimit — contador compartido en Postgres", () => {
  it("mapea una fila permitida", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: [{ is_allowed: true, retry_after: 0 }], error: null }), "upload", 120, 3600)
    expect(r).toEqual({ permitido: true, restantes: 0, reintentarEn: 0 })
  })

  it("mapea una fila bloqueada con su retry_after (redondeado hacia arriba)", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: [{ is_allowed: false, retry_after: 29 }], error: null }), "upload", 120, 3600)
    expect(r).toEqual({ permitido: false, restantes: 0, reintentarEn: 29 })
  })

  it("acepta la fila como objeto suelto además de como arreglo", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: { is_allowed: true, retry_after: 0 }, error: null }), "upload", 120, 3600)
    expect(r?.permitido).toBe(true)
  })

  it("devuelve null (para caer al límite local) cuando la migración no existe", async () => {
    // PGRST202 = la función RPC no está en el esquema todavía.
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: null, error: { code: "PGRST202" } }), "upload", 120, 3600)
    expect(r).toBeNull()
  })

  it("devuelve null ante cualquier otro error (no rompe la subida)", async () => {
    const r = await checkAuthenticatedRateLimit(fakeSupabase({ data: null, error: { code: "XX000", message: "boom" } }), "upload", 120, 3600)
    expect(r).toBeNull()
  })

  it("devuelve null si la fila viene malformada", async () => {
    expect(await checkAuthenticatedRateLimit(fakeSupabase({ data: [], error: null }), "upload", 120, 3600)).toBeNull()
    expect(await checkAuthenticatedRateLimit(fakeSupabase({ data: [{ is_allowed: "yes" }], error: null }), "upload", 120, 3600)).toBeNull()
  })
})

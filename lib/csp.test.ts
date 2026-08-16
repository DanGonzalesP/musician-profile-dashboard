import { afterEach, describe, expect, it } from "vitest"
import { crearCsp } from "./csp"

const entornoOriginal = { ...process.env }

afterEach(() => {
  process.env = { ...entornoOriginal }
})

describe("crearCsp", () => {
  it("usa nonce y no permite JavaScript inline ni eval en producción", () => {
    const csp = crearCsp("nonce-unico", false)
    const scripts = csp.split("; ").find((parte) => parte.startsWith("script-src"))

    expect(scripts).toContain("'nonce-nonce-unico'")
    expect(scripts).toContain("'strict-dynamic'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
    expect(csp).toContain("'wasm-unsafe-eval'")
  })

  it("limita unsafe-eval al desarrollo", () => {
    const csp = crearCsp("n", true)
    const scripts = csp.split("; ").find((parte) => parte.startsWith("script-src"))

    expect(scripts).toContain("'unsafe-eval'")
  })

  it("solo agrega orígenes configurables HTTPS válidos", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co/ruta"
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "http://bucket-inseguro.example"
    process.env.R2_ENDPOINT = "valor-invalido"

    const csp = crearCsp("n", false)

    expect(csp).toContain("https://proyecto.supabase.co")
    expect(csp).toContain("wss://proyecto.supabase.co")
    expect(csp).not.toContain("bucket-inseguro")
    expect(csp).not.toContain("valor-invalido")
  })

  it("admite Supabase local solo durante desarrollo", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"

    expect(crearCsp("n", true)).toContain("ws://127.0.0.1:54321")
    expect(crearCsp("n", false)).not.toContain("127.0.0.1:54321")
  })
})

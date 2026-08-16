import { afterEach, describe, expect, it } from "vitest"
import { crearCsp } from "./csp"

const entornoOriginal = { ...process.env }

afterEach(() => {
  process.env = { ...entornoOriginal }
})

/**
 * Navegador de mentira: decide si una imagen se cargaría o se bloquearía bajo
 * la directiva `img-src` de una CSP, aplicando las mismas reglas de
 * coincidencia que aplica el navegador — el esquema tiene que coincidir y el
 * comodín de `https://*.dominio` cubre subdominios pero no el apex ni un host
 * que sólo *contenga* ese texto.
 *
 * Existe para que estas pruebas comprueben la DECISIÓN de la política (¿la
 * miniatura de TikTok llega a pintarse?) y no la presencia de un texto dentro
 * del header, que es justo lo que no demuestra nada.
 */
function imagenPermitida(csp: string, url: string): boolean {
  const directiva = csp.split("; ").find((parte) => parte.startsWith("img-src ")) ?? ""
  const destino = new URL(url)

  return directiva
    .split(" ")
    .slice(1)
    .some((fuente) => {
      // 'self', data:, blob: y demás no aplican a un origen externo.
      if (!fuente.startsWith("http://") && !fuente.startsWith("https://")) return false
      const comodin = fuente.includes("://*.")
      const permitida = new URL(fuente.replace("://*.", "://"))
      if (permitida.protocol !== destino.protocol) return false
      return comodin
        ? destino.hostname.endsWith(`.${permitida.hostname}`)
        : destino.hostname === permitida.hostname
    })
}

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

describe("img-src — miniaturas de los oEmbed admitidos", () => {
  const csp = () => crearCsp("n", false)

  // `app/api/oembed/route.ts` devuelve el thumbnail_url del oEmbed de TikTok y
  // el perfil público lo pinta tal cual; el host real varía por región y punto
  // de presencia, así que se comprueban los dos dominios de su CDN.
  it("permite la miniatura que devuelve el oEmbed de TikTok", () => {
    expect(imagenPermitida(csp(), "https://p16-sign-va.tiktokcdn.com/obj/tos-maliva-p-0068/prueba~c5_300x400.jpeg")).toBe(true)
    expect(imagenPermitida(csp(), "https://p19-sign.tiktokcdn-us.com/obj/tos-useast5-p-0068/prueba~tplv-photomode.jpeg")).toBe(true)
  })

  it("mantiene permitidas las miniaturas de los demás proveedores", () => {
    expect(imagenPermitida(csp(), "https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true)
    expect(imagenPermitida(csp(), "https://i.scdn.co/image/abc")).toBe(true)
    expect(imagenPermitida(csp(), "https://i1.sndcdn.com/artworks-abc-t500x500.jpg")).toBe(true)
    expect(imagenPermitida(csp(), "https://scontent.xx.fbcdn.net/v/t1/abc.jpg")).toBe(true)
    expect(imagenPermitida(csp(), "https://scontent.cdninstagram.com/v/t51/abc.jpg")).toBe(true)
  })

  it("bloquea un host ajeno que imita al CDN de TikTok", () => {
    expect(imagenPermitida(csp(), "https://tiktokcdn.com.atacante.example/robo.jpg")).toBe(false)
    expect(imagenPermitida(csp(), "https://atacante.example/p16-sign-va.tiktokcdn.com.jpg")).toBe(false)
    expect(imagenPermitida(csp(), "https://atacante.example/x.jpg")).toBe(false)
    // El comodín cubre subdominios, no el esquema: sin https no entra.
    expect(imagenPermitida(csp(), "http://p16-sign-va.tiktokcdn.com/x.jpg")).toBe(false)
  })

  it("no abre el esquema https entero ni un comodín global", () => {
    const fuentes = (csp().split("; ").find((parte) => parte.startsWith("img-src ")) ?? "").split(" ").slice(1)

    expect(fuentes).not.toContain("https:")
    expect(fuentes).not.toContain("*")
    expect(fuentes).not.toContain("https://*")
  })
})

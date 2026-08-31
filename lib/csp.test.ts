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

/**
 * El mismo navegador de mentira, pero para `connect-src`: decide si el
 * navegador dejaría salir un `fetch`/XHR/WebSocket hacia esa URL.
 *
 * Importa para las subidas: el archivo NO pasa por el servidor de Vibe. El
 * navegador hace un PUT **directo** al endpoint de R2 con la URL firmada que
 * devuelve `/api/upload-url`. Si ese origen no está en `connect-src`, la CSP
 * corta el PUT y la subida falla en el navegador, con la URL ya firmada y la
 * fila ya escrita en `media_assets`.
 */
function conexionPermitida(csp: string, url: string): boolean {
  const directiva = csp.split("; ").find((parte) => parte.startsWith("connect-src ")) ?? ""
  const destino = new URL(url)

  return directiva
    .split(" ")
    .slice(1)
    .some((fuente) => {
      if (!/^(https?|wss?):\/\//.test(fuente)) return false
      const comodin = fuente.includes("://*.")
      const permitida = new URL(fuente.replace("://*.", "://"))
      if (permitida.protocol !== destino.protocol) return false
      if (permitida.port && permitida.port !== destino.port) return false
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

describe("connect-src — el PUT de subida a R2", () => {
  // El endpoint tiene la forma que Cloudflare entrega de verdad. Lo que se
  // prueba es la DECISIÓN de la política sobre la URL firmada, no que cierto
  // texto aparezca en la cabecera.
  const ENDPOINT = "https://cuenta-de-prueba.r2.cloudflarestorage.com"
  const URL_FIRMADA = `${ENDPOINT}/vibe/audio/1234-abc.mp3?X-Amz-Signature=falsa`

  it("el origen derivado de R2_ENDPOINT entra en connect-src", () => {
    process.env.R2_ENDPOINT = ENDPOINT

    expect(conexionPermitida(crearCsp("n", false), URL_FIRMADA)).toBe(true)
  })

  // ─── La forma REAL de la URL firmada ────────────────────────────────────
  // El SDK de S3 firma en estilo virtual-hosted: el bucket va de subdominio.
  // Antes del 2026-08-17 la CSP sólo listaba el endpoint desnudo, así que el
  // navegador bloqueaba TODAS las subidas con "Refused to connect" y el editor
  // lo reportaba como `TypeError: Failed to fetch`.
  describe("estilo virtual-hosted (bucket como subdominio)", () => {
    const URL_VIRTUAL_HOSTED =
      "https://vibe.cuenta-de-prueba.r2.cloudflarestorage.com/images/1788-abc.webp?X-Amz-Signature=falsa"

    it("permite el host con el bucket delante, que es el que firma el SDK", () => {
      process.env.R2_ENDPOINT = ENDPOINT
      process.env.R2_BUCKET_NAME = "vibe"

      expect(conexionPermitida(crearCsp("n", false), URL_VIRTUAL_HOSTED)).toBe(true)
    })

    it("sigue permitiendo el endpoint desnudo (estilo path, por si se activa)", () => {
      process.env.R2_ENDPOINT = ENDPOINT
      process.env.R2_BUCKET_NAME = "vibe"

      expect(conexionPermitida(crearCsp("n", false), `${ENDPOINT}/vibe/images/x.webp`)).toBe(true)
    })

    it("no abre el bucket de otra cuenta ni un bucket distinto", () => {
      process.env.R2_ENDPOINT = ENDPOINT
      process.env.R2_BUCKET_NAME = "vibe"
      const csp = crearCsp("n", false)

      expect(conexionPermitida(csp, "https://otro-bucket.cuenta-de-prueba.r2.cloudflarestorage.com/x")).toBe(false)
      expect(conexionPermitida(csp, "https://vibe.otra-cuenta.r2.cloudflarestorage.com/x")).toBe(false)
    })

    it("no se duplica si el endpoint ya trae el bucket", () => {
      process.env.R2_ENDPOINT = "https://vibe.cuenta-de-prueba.r2.cloudflarestorage.com"
      process.env.R2_BUCKET_NAME = "vibe"

      const fuentes = (crearCsp("n", false).split("; ").find((p) => p.startsWith("connect-src ")) ?? "")
        .split(" ")
        .slice(1)
      const repetidos = fuentes.filter((f) => f.includes("cuenta-de-prueba"))
      expect(repetidos).toHaveLength(1)
    })

    it("sin R2_BUCKET_NAME no se inventa ningún subdominio", () => {
      process.env.R2_ENDPOINT = ENDPOINT
      delete process.env.R2_BUCKET_NAME

      const csp = crearCsp("n", false)
      expect(conexionPermitida(csp, URL_VIRTUAL_HOSTED)).toBe(false)
      const fuentes = (csp.split("; ").find((p) => p.startsWith("connect-src ")) ?? "").split(" ").slice(1)
      expect(fuentes.some((f) => f.includes("*"))).toBe(false)
    })
  })

  it("el origen entra aunque el endpoint traiga bucket y ruta", () => {
    // `R2_ENDPOINT` se configura a veces con el bucket incluido. La CSP compara
    // orígenes, así que la ruta sobra y no debe romper la coincidencia.
    process.env.R2_ENDPOINT = `${ENDPOINT}/vibe`

    expect(conexionPermitida(crearCsp("n", false), URL_FIRMADA)).toBe(true)
  })

  it("SIN R2_ENDPOINT el PUT queda bloqueado: la política no se abre sola", () => {
    delete process.env.R2_ENDPOINT

    const csp = crearCsp("n", false)
    expect(conexionPermitida(csp, URL_FIRMADA)).toBe(false)
    // Y no aparece ningún comodín que lo permita por la puerta de atrás.
    const fuentes = (csp.split("; ").find((p) => p.startsWith("connect-src ")) ?? "").split(" ").slice(1)
    expect(fuentes).not.toContain("https:")
    expect(fuentes).not.toContain("*")
    expect(fuentes).not.toContain("https://*")
  })

  it("un endpoint en texto plano no abre connect-src", () => {
    process.env.R2_ENDPOINT = "http://cuenta-de-prueba.r2.cloudflarestorage.com"

    expect(
      conexionPermitida(crearCsp("n", false), "http://cuenta-de-prueba.r2.cloudflarestorage.com/x")
    ).toBe(false)
  })

  it("otro host de R2 no se cuela por parecerse", () => {
    process.env.R2_ENDPOINT = ENDPOINT
    const csp = crearCsp("n", false)

    expect(conexionPermitida(csp, "https://otra-cuenta.r2.cloudflarestorage.com/x")).toBe(false)
    expect(conexionPermitida(csp, "https://cuenta-de-prueba.r2.cloudflarestorage.com.atacante.example/x")).toBe(false)
  })

  it("la lectura pública de R2 y Supabase siguen permitidas", () => {
    process.env.R2_ENDPOINT = ENDPOINT
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "https://pub-ejemplo.r2.dev"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co"

    const csp = crearCsp("n", false)
    expect(conexionPermitida(csp, "https://pub-ejemplo.r2.dev/images/portada.webp")).toBe(true)
    expect(conexionPermitida(csp, "https://proyecto.supabase.co/rest/v1/profiles")).toBe(true)
    expect(conexionPermitida(csp, "wss://proyecto.supabase.co/realtime/v1")).toBe(true)
  })
})

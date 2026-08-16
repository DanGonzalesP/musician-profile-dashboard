import { describe, it, expect } from "vitest"
import { fotoSocialPermitida } from "./imagen-social"

const BUCKET = "https://pub-abc123.r2.dev"

describe("fotoSocialPermitida — el fondo de la tarjeta social lo descarga el servidor", () => {
  it("acepta una foto del bucket público", () => {
    expect(fotoSocialPermitida(`${BUCKET}/images/1738-a1b2.jpg`, BUCKET)).toBe(
      `${BUCKET}/images/1738-a1b2.jpg`
    )
  })

  it("acepta el bucket declarado con barra final", () => {
    expect(fotoSocialPermitida(`${BUCKET}/images/x.png`, `${BUCKET}/`)).toBe(`${BUCKET}/images/x.png`)
  })

  it("rechaza un host que sólo comparte el PREFIJO (el bug clásico del startsWith)", () => {
    expect(fotoSocialPermitida("https://pub-abc123.r2.dev.atacante.com/x.png", BUCKET)).toBeUndefined()
  })

  it("rechaza la metadata del cloud, que es el objetivo real de un SSRF", () => {
    expect(fotoSocialPermitida("http://169.254.169.254/latest/meta-data/", BUCKET)).toBeUndefined()
    expect(fotoSocialPermitida("http://metadata.google.internal/", BUCKET)).toBeUndefined()
  })

  it("rechaza la red interna y el propio host", () => {
    for (const hostil of [
      "http://127.0.0.1:8080/",
      "http://localhost/admin",
      "http://10.0.0.5/",
      "https://192.168.1.1/",
    ]) {
      expect(fotoSocialPermitida(hostil, BUCKET)).toBeUndefined()
    }
  })

  it("rechaza http aunque el host sea el correcto: sólo https", () => {
    expect(fotoSocialPermitida("http://pub-abc123.r2.dev/x.png", BUCKET)).toBeUndefined()
  })

  it("rechaza esquemas que no son http(s)", () => {
    for (const raro of [
      "file:///etc/passwd",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "javascript:alert(1)",
      "gopher://interno/",
    ]) {
      expect(fotoSocialPermitida(raro, BUCKET)).toBeUndefined()
    }
  })

  it("rechaza lo que no es una cadena o está vacío", () => {
    for (const nada of [undefined, null, "", "   ", 42, {}, []]) {
      expect(fotoSocialPermitida(nada, BUCKET)).toBeUndefined()
    }
  })

  it("sin bucket configurado no permite NADA (fail-closed)", () => {
    expect(fotoSocialPermitida(`${BUCKET}/images/x.png`, undefined)).toBeUndefined()
    expect(fotoSocialPermitida(`${BUCKET}/images/x.png`, "")).toBeUndefined()
    expect(fotoSocialPermitida(`${BUCKET}/images/x.png`, "no-es-una-url")).toBeUndefined()
  })
})

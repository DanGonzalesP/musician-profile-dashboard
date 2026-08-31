import { describe, expect, it } from "vitest"
import {
  VARIABLES_DE_SUBIDA_R2,
  origenDeSubidaR2,
  subidasR2Configuradas,
  variablesDeSubidaAusentes,
} from "./r2-config"

// Entorno completo y realista. El endpoint tiene la forma que Cloudflare
// entrega de verdad (`<account-id>.r2.cloudflarestorage.com`), porque lo que se
// prueba es el origen que sale de ahí y termina en `connect-src`.
const ENTORNO_COMPLETO = {
  R2_ENDPOINT: "https://cuenta-de-prueba.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "clave-de-prueba",
  R2_SECRET_ACCESS_KEY: "secreto-de-prueba",
  R2_BUCKET_NAME: "vibe-pruebas",
  NEXT_PUBLIC_R2_PUBLIC_URL: "https://pub-ejemplo.r2.dev",
}

describe("variablesDeSubidaAusentes", () => {
  it("con todo configurado no reporta nada", () => {
    expect(variablesDeSubidaAusentes(ENTORNO_COMPLETO)).toEqual([])
  })

  it("nombra exactamente la variable que falta", () => {
    for (const nombre of VARIABLES_DE_SUBIDA_R2) {
      const incompleto = { ...ENTORNO_COMPLETO, [nombre]: undefined }
      expect(variablesDeSubidaAusentes(incompleto)).toEqual([nombre])
    }
  })

  it("una cadena vacía o de espacios cuenta como ausente", () => {
    // Es el resultado tipico de pegar mal un valor en el panel de Vercel:
    // la variable "existe" y firma igual de mal que si no estuviera.
    expect(variablesDeSubidaAusentes({ ...ENTORNO_COMPLETO, R2_BUCKET_NAME: "" })).toEqual([
      "R2_BUCKET_NAME",
    ])
    expect(variablesDeSubidaAusentes({ ...ENTORNO_COMPLETO, R2_ACCESS_KEY_ID: "   " })).toEqual([
      "R2_ACCESS_KEY_ID",
    ])
  })

  it("un entorno vacío reporta las cinco", () => {
    expect(variablesDeSubidaAusentes({})).toEqual([...VARIABLES_DE_SUBIDA_R2])
  })
})

describe("origenDeSubidaR2", () => {
  it("deriva el origen del endpoint, sin la ruta", () => {
    expect(
      origenDeSubidaR2({ R2_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com/vibe/ruta?x=1" })
    ).toBe("https://cuenta.r2.cloudflarestorage.com")
  })

  it("rechaza un endpoint que no sea HTTPS", () => {
    // Un PUT firmado por HTTP expondria la firma de la subida en la red.
    expect(origenDeSubidaR2({ R2_ENDPOINT: "http://cuenta.r2.cloudflarestorage.com" })).toBeNull()
  })

  it("rechaza un endpoint malformado o ausente", () => {
    expect(origenDeSubidaR2({ R2_ENDPOINT: "no-es-una-url" })).toBeNull()
    expect(origenDeSubidaR2({ R2_ENDPOINT: "" })).toBeNull()
    expect(origenDeSubidaR2({})).toBeNull()
  })
})

describe("subidasR2Configuradas — fail-closed", () => {
  it("con la configuración completa, la subida puede intentarse", () => {
    expect(subidasR2Configuradas(ENTORNO_COMPLETO)).toBe(true)
  })

  it("sin configuración, no", () => {
    expect(subidasR2Configuradas({})).toBe(false)
  })

  it("un endpoint presente pero malformado también cierra la puerta", () => {
    // Es el caso peor: pasa la comprobación de presencia y revienta al firmar,
    // despues de que upload-url ya registro la fila en media_assets.
    expect(subidasR2Configuradas({ ...ENTORNO_COMPLETO, R2_ENDPOINT: "cuenta.r2.example" })).toBe(false)
  })

  it("un endpoint en texto plano también cierra la puerta", () => {
    expect(
      subidasR2Configuradas({ ...ENTORNO_COMPLETO, R2_ENDPOINT: "http://cuenta.r2.example" })
    ).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { crearPoliticaCors } from "../scripts/r2-cors-policy.mjs"

describe("CORS de subidas", () => {
  it("autoriza sólo el origen elegido y las cabeceras del PUT condicional", () => {
    expect(crearPoliticaCors("https://vibe-staging.vibemusicprofile.workers.dev/")).toEqual({
      CORSRules: [{AllowedOrigins: ["https://vibe-staging.vibemusicprofile.workers.dev"],
        AllowedMethods: ["PUT"], AllowedHeaders: ["Content-Type", "If-None-Match"],
        ExposeHeaders: ["ETag"], MaxAgeSeconds: 600}],
    })
  })
  it("permite localhost sólo cuando se pide explícitamente", () => {
    expect(crearPoliticaCors("http://localhost:3070").CORSRules[0].AllowedOrigins).toEqual(["http://localhost:3070"])
  })
  it.each([undefined, "", "https://*.workers.dev", "https://example.com/ruta",
    "https://example.com?token=privado", "https://example.com#fragmento",
    "https://usuario:clave@example.com", "http://example.com", "no-es-url"])(
    "rechaza un origen ausente, amplio o ambiguo (%s)", sitio => {
      expect(() => crearPoliticaCors(sitio)).toThrow()
    },
  )
})

import { describe, it, expect, afterEach } from "vitest"
import {
  CLAVE_CONSENTIMIENTO,
  EVENTO_CONSENTIMIENTO,
  debePreguntar,
  guardarDecision,
  leerDecision,
  normalizarDecision,
  permiteAnalitica,
} from "./consentimiento-cookies"

// P-31 — la analítica sólo puede cargarse tras un sí explícito. Estas pruebas
// fijan ese contrato: cualquier estado que no sea "aceptado" mantiene apagado
// `@vercel/analytics`, incluido el caso en que el almacenamiento falla.

/** Sustituye `window` por lo mínimo que usa el módulo. El entorno es node. */
function montarVentana(opciones: { almacenRoto?: boolean; inicial?: string } = {}) {
  const datos = new Map<string, string>()
  if (opciones.inicial !== undefined) datos.set(CLAVE_CONSENTIMIENTO, opciones.inicial)

  const eventos: { tipo: string; detalle: unknown }[] = []

  const ventana = {
    localStorage: {
      getItem(clave: string) {
        if (opciones.almacenRoto) throw new Error("almacenamiento bloqueado")
        return datos.has(clave) ? datos.get(clave)! : null
      },
      setItem(clave: string, valor: string) {
        if (opciones.almacenRoto) throw new Error("almacenamiento bloqueado")
        datos.set(clave, valor)
      },
    },
    dispatchEvent(evento: { type: string; detail?: unknown }) {
      eventos.push({ tipo: evento.type, detalle: evento.detail })
      return true
    },
    CustomEvent: class {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    },
  }

  ;(globalThis as { window?: unknown }).window = ventana
  ;(globalThis as { CustomEvent?: unknown }).CustomEvent = ventana.CustomEvent
  return { datos, eventos }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { CustomEvent?: unknown }).CustomEvent
})

describe("normalizarDecision", () => {
  it("acepta sólo los dos valores conocidos", () => {
    expect(normalizarDecision("aceptado")).toBe("aceptado")
    expect(normalizarDecision("rechazado")).toBe("rechazado")
  })

  it("cualquier otra cosa cae en 'sin-decidir'", () => {
    for (const basura of [null, undefined, "", "si", "true", 1, {}, []]) {
      expect(normalizarDecision(basura)).toBe("sin-decidir")
    }
  })
})

describe("permiteAnalitica — fail-closed", () => {
  it("sólo un sí explícito enciende la analítica", () => {
    expect(permiteAnalitica("aceptado")).toBe(true)
    expect(permiteAnalitica("rechazado")).toBe(false)
    expect(permiteAnalitica("sin-decidir")).toBe(false)
  })
})

describe("debePreguntar", () => {
  it("pregunta mientras no haya decisión, y nunca después", () => {
    expect(debePreguntar("sin-decidir")).toBe(true)
    expect(debePreguntar("aceptado")).toBe(false)
    expect(debePreguntar("rechazado")).toBe(false)
  })
})

describe("leerDecision", () => {
  it("en el servidor (sin window) devuelve 'sin-decidir'", () => {
    expect(leerDecision()).toBe("sin-decidir")
  })

  it("lee lo que hay guardado", () => {
    montarVentana({ inicial: "aceptado" })
    expect(leerDecision()).toBe("aceptado")
  })

  it("con el almacenamiento bloqueado no lanza y no rastrea", () => {
    montarVentana({ almacenRoto: true })
    expect(leerDecision()).toBe("sin-decidir")
    expect(permiteAnalitica(leerDecision())).toBe(false)
  })

  it("un valor manipulado a mano no habilita la analítica", () => {
    montarVentana({ inicial: "ACEPTADO_TODO" })
    expect(leerDecision()).toBe("sin-decidir")
  })
})

describe("guardarDecision", () => {
  it("persiste la respuesta y avisa en la misma pestaña", () => {
    const { datos, eventos } = montarVentana()
    guardarDecision("aceptado")

    expect(datos.get(CLAVE_CONSENTIMIENTO)).toBe("aceptado")
    expect(eventos).toEqual([{ tipo: EVENTO_CONSENTIMIENTO, detalle: "aceptado" }])
    expect(leerDecision()).toBe("aceptado")
  })

  it("un rechazo también se recuerda: no se vuelve a preguntar", () => {
    montarVentana()
    guardarDecision("rechazado")
    expect(debePreguntar(leerDecision())).toBe(false)
    expect(permiteAnalitica(leerDecision())).toBe(false)
  })

  it("si el almacenamiento falla, no lanza y aun así avisa a la interfaz", () => {
    const { eventos } = montarVentana({ almacenRoto: true })
    expect(() => guardarDecision("rechazado")).not.toThrow()
    expect(eventos).toHaveLength(1)
  })
})

import { afterEach, describe, expect, it } from "vitest"
import {
  CUOTA_POR_DEFECTO_GB,
  GIGABYTE,
  evaluarCuota,
  formatearGb,
  limiteCuotaBytes,
  modoCuota,
} from "./cuota-almacenamiento"

// Cuota de almacenamiento.
//
// Sin esto, el rate limit sólo frena la FRECUENCIA de las subidas: 120
// archivos de 200 MB por hora están dentro del límite y son 24 GB por hora.
//
// Lo que se congela aquí es sobre todo el comportamiento del MODO. Que el
// modo observación no rechace nunca es la propiedad que hace seguro desplegar
// esto sin conocer todavía cuánto ocupa un artista real.

const entornoOriginal = {
  MODO: process.env.CUOTA_ALMACENAMIENTO_MODO,
  GB: process.env.CUOTA_ALMACENAMIENTO_GB,
}

afterEach(() => {
  process.env.CUOTA_ALMACENAMIENTO_MODO = entornoOriginal.MODO
  process.env.CUOTA_ALMACENAMIENTO_GB = entornoOriginal.GB
})

describe("modoCuota", () => {
  it("por defecto observa, no rechaza", () => {
    delete process.env.CUOTA_ALMACENAMIENTO_MODO
    expect(modoCuota()).toBe("observar")
  })

  it("sólo el valor exacto 'rechazar' activa el rechazo", () => {
    process.env.CUOTA_ALMACENAMIENTO_MODO = "rechazar"
    expect(modoCuota()).toBe("rechazar")

    // Un valor a medias —una errata, un "true", un "1"— NO debe cerrar la
    // puerta sin querer: el paso a rechazo es una decisión explícita.
    for (const valor of ["Rechazar", "true", "1", "si", "rechaza", ""]) {
      process.env.CUOTA_ALMACENAMIENTO_MODO = valor
      expect(modoCuota()).toBe("observar")
    }
  })
})

describe("limiteCuotaBytes", () => {
  it("usa el valor configurado", () => {
    process.env.CUOTA_ALMACENAMIENTO_GB = "12"
    expect(limiteCuotaBytes()).toBe(12 * GIGABYTE)
  })

  // Ante una configuración rota se sigue MIDIENDO. Lo contrario —caer a
  // "sin límite"— convertiría una variable vacía por despiste en
  // almacenamiento infinito, que es justo lo que esto viene a evitar.
  it("una configuración inválida cae al valor por defecto, no a 'sin límite'", () => {
    for (const valor of ["", "cero", "-5", "0", "NaN"]) {
      process.env.CUOTA_ALMACENAMIENTO_GB = valor
      expect(limiteCuotaBytes()).toBe(CUOTA_POR_DEFECTO_GB * GIGABYTE)
    }

    delete process.env.CUOTA_ALMACENAMIENTO_GB
    expect(limiteCuotaBytes()).toBe(CUOTA_POR_DEFECTO_GB * GIGABYTE)
  })

  it("admite fracciones de giga", () => {
    process.env.CUOTA_ALMACENAMIENTO_GB = "0.5"
    expect(limiteCuotaBytes()).toBe(Math.round(0.5 * GIGABYTE))
  })
})

describe("evaluarCuota", () => {
  const limiteBytes = 10 * GIGABYTE

  it("deja pasar lo que cabe", () => {
    const d = evaluarCuota({ usadoBytes: GIGABYTE, bytesPedidos: GIGABYTE, limiteBytes, modo: "rechazar" })
    expect(d.permitido).toBe(true)
    expect(d.excede).toBe(false)
  })

  it("en modo rechazar, corta lo que no cabe", () => {
    const d = evaluarCuota({
      usadoBytes: 9.5 * GIGABYTE,
      bytesPedidos: GIGABYTE,
      limiteBytes,
      modo: "rechazar",
    })
    expect(d.permitido).toBe(false)
    expect(d.excede).toBe(true)
  })

  // LA PROPIEDAD CENTRAL: observar nunca rechaza, pero sí marca el exceso.
  // Si esto se rompiera, desplegar la cuota dejaría de ser seguro.
  it("en modo observar NUNCA rechaza, aunque marque el exceso", () => {
    const d = evaluarCuota({
      usadoBytes: 500 * GIGABYTE,
      bytesPedidos: 50 * GIGABYTE,
      limiteBytes,
      modo: "observar",
    })
    expect(d.permitido).toBe(true)
    expect(d.excede).toBe(true)
  })

  // `permitido` y `excede` son campos separados justamente para que se pueda
  // registrar el exceso sin recalcular la condición en quien llama.
  it("permitido y excede son independientes", () => {
    const observando = evaluarCuota({
      usadoBytes: limiteBytes,
      bytesPedidos: 1,
      limiteBytes,
      modo: "observar",
    })
    const rechazando = evaluarCuota({
      usadoBytes: limiteBytes,
      bytesPedidos: 1,
      limiteBytes,
      modo: "rechazar",
    })
    expect(observando.excede).toBe(rechazando.excede)
    expect(observando.permitido).not.toBe(rechazando.permitido)
  })

  // Se cuentan los bytes PEDIDOS, no sólo los ya usados: autorizar primero y
  // medir después dejaría pasarse del límite en cada subida.
  it("cuenta el archivo que se está pidiendo, no sólo lo ya guardado", () => {
    const justoEnElBorde = evaluarCuota({
      usadoBytes: limiteBytes,
      bytesPedidos: 0,
      limiteBytes,
      modo: "rechazar",
    })
    expect(justoEnElBorde.excede).toBe(false)

    const unByteMas = evaluarCuota({
      usadoBytes: limiteBytes,
      bytesPedidos: 1,
      limiteBytes,
      modo: "rechazar",
    })
    expect(unByteMas.excede).toBe(true)
  })

  it("el restante nunca es negativo", () => {
    const d = evaluarCuota({
      usadoBytes: 50 * GIGABYTE,
      bytesPedidos: 0,
      limiteBytes,
      modo: "observar",
    })
    expect(d.restanteBytes).toBe(0)
  })

  it("informa lo necesario para que el usuario sepa qué hacer", () => {
    const d = evaluarCuota({ usadoBytes: 3 * GIGABYTE, bytesPedidos: 0, limiteBytes, modo: "rechazar" })
    expect(d.usadoBytes).toBe(3 * GIGABYTE)
    expect(d.limiteBytes).toBe(limiteBytes)
    expect(d.restanteBytes).toBe(7 * GIGABYTE)
  })
})

describe("formatearGb", () => {
  it("redondea a un decimal", () => {
    expect(formatearGb(1.44 * GIGABYTE)).toBe("1.4 GB")
    expect(formatearGb(0)).toBe("0.0 GB")
  })
})

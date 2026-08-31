import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// El contrato del motor único de audio (F11 del plan: "fijar por pruebas el
// contrato del motor único", sin reescribirlo).
//
// Los tres bugs que este módulo existe para haber matado —dos canciones
// sonando a la vez, el audio zombie al cambiar rápido de pista, y el vídeo
// pisándose con la música— son de CONCURRENCIA, y ninguno se ve leyendo el
// código: dependen de en qué orden resuelven las promesas de `play()`.
//
// ─── POR QUÉ UN DOM FALSO Y NO jsdom ──────────────────────────────────────
// jsdom no implementa `HTMLMediaElement.play()`: devuelve `undefined` y avisa
// "Not implemented". Justo la promesa cuya resolución tardía es el corazón del
// bug del audio zombie. Con un doble propio esa promesa se resuelve CUANDO LA
// PRUEBA QUIERE, que es la única forma de reproducir la carrera a voluntad —
// y de paso el repositorio no gana una dependencia sólo para esto.

type ResolverPlay = () => void

/** Doble de HTMLAudioElement con control manual de la promesa de `play()`. */
class AudioFalso {
  src = ""
  currentTime = 0
  duration = 0
  paused = true
  muted = false
  preload = ""
  /** Resolutores pendientes de cada `play()`, en orden de llamada. */
  playsPendientes: ResolverPlay[] = []
  vecesQueSeLlamoPause = 0
  private oyentes = new Map<string, Array<() => void>>()

  addEventListener(evento: string, cb: () => void) {
    const previos = this.oyentes.get(evento) ?? []
    this.oyentes.set(evento, [...previos, cb])
  }

  emitir(evento: string) {
    for (const cb of this.oyentes.get(evento) ?? []) cb()
  }

  play(): Promise<void> {
    this.paused = false
    return new Promise<void>((resolve) => {
      this.playsPendientes.push(() => {
        resolve()
      })
    })
  }

  pause() {
    this.paused = true
    this.vecesQueSeLlamoPause++
  }

  removeAttribute(nombre: string) {
    if (nombre === "src") this.src = ""
  }

  load() {}

  /** Resuelve la N-ésima llamada a `play()` (0 = la primera). */
  resolverPlay(indice: number) {
    this.playsPendientes[indice]?.()
  }
}

/** Doble de un <audio>/<video> del DOM ajeno al motor (p. ej. MediaViewer). */
class MedioDelDom {
  paused: boolean
  muted: boolean
  vecesQueSeLlamoPause = 0

  constructor(opciones: { paused?: boolean; muted?: boolean } = {}) {
    this.paused = opciones.paused ?? false
    this.muted = opciones.muted ?? false
  }

  pause() {
    this.paused = true
    this.vecesQueSeLlamoPause++
  }
}

let creados: AudioFalso[] = []
let mediosDelDom: MedioDelDom[] = []

beforeEach(() => {
  creados = []
  mediosDelDom = []

  vi.stubGlobal("window", globalThis)
  vi.stubGlobal("Audio", function Audio(this: unknown) {
    const instancia = new AudioFalso()
    creados.push(instancia)
    return instancia as unknown as HTMLAudioElement
  })
  vi.stubGlobal("document", {
    querySelectorAll: () => mediosDelDom,
  })
  // El bucle del nivel de fondo se agenda con rAF. Se deja inerte: no aporta
  // nada al contrato y encadenaría fotogramas para siempre.
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** Módulo fresco por prueba: su estado vive a nivel de módulo. */
async function cargarMotor() {
  vi.resetModules()
  return import("./audio-engine")
}

describe("motor de audio · una sola fuente a la vez", () => {
  it("reutiliza UN único elemento aunque se pidan varias pistas", async () => {
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    motor.play("https://ejemplo.local/b.mp3")
    motor.play("https://ejemplo.local/c.mp3")

    // Es la garantía estructural de "nunca suenan dos a la vez": con un solo
    // elemento, cargar una pista nueva corta la anterior por construcción.
    expect(creados).toHaveLength(1)
    expect(creados[0].src).toBe("https://ejemplo.local/c.mp3")
  })

  it("audio↔audio: la segunda pista reemplaza a la primera y reinicia el tiempo", async () => {
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    creados[0].currentTime = 42

    motor.play("https://ejemplo.local/b.mp3")

    expect(creados[0].src).toBe("https://ejemplo.local/b.mp3")
    expect(creados[0].currentTime).toBe(0)
    expect(motor.getState().url).toBe("https://ejemplo.local/b.mp3")
  })

  it("volver a pedir la MISMA pista reanuda, no reinicia", async () => {
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    creados[0].currentTime = 30
    motor.play("https://ejemplo.local/a.mp3")

    expect(creados[0].currentTime).toBe(30)
  })
})

describe("motor de audio · audio↔vídeo", () => {
  it("al arrancar pausa cualquier medio audible del DOM", async () => {
    // El visor de Publicaciones reproduce vídeo por su cuenta, sin pasar por el
    // motor. Sin esta pasada, la música y el vídeo sonarían encima.
    const video = new MedioDelDom({ paused: false, muted: false })
    mediosDelDom.push(video)

    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    expect(video.paused).toBe(true)
    expect(video.vecesQueSeLlamoPause).toBe(1)
  })

  it("NO toca los medios muteados: son decoración, no sonido", async () => {
    // Las miniaturas del feed se reproducen muteadas sólo para animar. Pausarlas
    // sería un cambio visible para el usuario y ninguna mejora.
    const miniatura = new MedioDelDom({ paused: false, muted: true })
    mediosDelDom.push(miniatura)

    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    expect(miniatura.paused).toBe(false)
    expect(miniatura.vecesQueSeLlamoPause).toBe(0)
  })

  it("tampoco molesta a los que ya estaban en pausa", async () => {
    const enPausa = new MedioDelDom({ paused: true, muted: false })
    mediosDelDom.push(enPausa)

    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    expect(enPausa.vecesQueSeLlamoPause).toBe(0)
  })

  it("cada reanudación vuelve a barrer el DOM", async () => {
    // Un vídeo puede haber arrancado DESPUÉS de que la música empezara.
    const video = new MedioDelDom({ paused: false, muted: false })
    mediosDelDom.push(video)

    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")
    video.paused = false // el visor arrancó el vídeo mientras tanto

    motor.resume()

    expect(video.paused).toBe(true)
  })
})

describe("motor de audio · cambio rápido sin audio zombie", () => {
  it("la resolución tardía de una pista vieja no revive su estado", async () => {
    // ESTE es el bug que el token de generación existe para matar. El usuario
    // toca A y enseguida B; la promesa de A resuelve DESPUÉS de que B ya está
    // en marcha. Sin el token, ese callback tardío marcaba `playing: true`
    // para una pista que ya no existe, y el botón quedaba atascado.
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    motor.play("https://ejemplo.local/b.mp3")

    // Resuelve la promesa de A, la vieja, cuando ya no es la vigente.
    creados[0].resolverPlay(0)
    await Promise.resolve()

    expect(motor.getState().url).toBe("https://ejemplo.local/b.mp3")
    expect(motor.getState().playing).toBe(false)

    // Y cuando por fin resuelve la de B, esa sí manda.
    creados[0].resolverPlay(1)
    await Promise.resolve()

    expect(motor.getState().playing).toBe(true)
    expect(motor.getState().url).toBe("https://ejemplo.local/b.mp3")
  })

  it("aguanta una ráfaga de cambios y termina en la última pista", async () => {
    const motor = await cargarMotor()

    for (const letra of ["a", "b", "c", "d", "e"]) {
      motor.play(`https://ejemplo.local/${letra}.mp3`)
    }

    // Todas las promesas resuelven en desorden, como pasaría de verdad.
    const elemento = creados[0]
    for (const i of [2, 0, 4, 1, 3]) elemento.resolverPlay(i)
    await Promise.resolve()

    expect(creados).toHaveLength(1)
    expect(motor.getState().url).toBe("https://ejemplo.local/e.mp3")
    expect(elemento.src).toBe("https://ejemplo.local/e.mp3")
  })

  it("un play() rechazado no deja el estado en 'sonando'", async () => {
    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    // El navegador rechaza con AbortError cuando el src cambia a mitad.
    expect(motor.getState().playing).toBe(false)
  })
})

describe("motor de audio · toggle, pause y stop", () => {
  it("toggle pausa si ya suena esa pista, y reanuda si estaba en pausa", async () => {
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    creados[0].resolverPlay(0)
    await Promise.resolve()
    expect(motor.getState().playing).toBe(true)

    motor.toggle("https://ejemplo.local/a.mp3")
    expect(motor.getState().playing).toBe(false)
    expect(creados[0].paused).toBe(true)

    motor.toggle("https://ejemplo.local/a.mp3")
    expect(creados[0].paused).toBe(false)
  })

  it("toggle sobre OTRA pista la carga en vez de pausar", async () => {
    const motor = await cargarMotor()

    motor.play("https://ejemplo.local/a.mp3")
    motor.toggle("https://ejemplo.local/b.mp3")

    expect(creados[0].src).toBe("https://ejemplo.local/b.mp3")
    expect(motor.getState().url).toBe("https://ejemplo.local/b.mp3")
  })

  it("stop descarga la pista por completo", async () => {
    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    motor.stop()

    expect(creados[0].src).toBe("")
    expect(motor.getState()).toMatchObject({ url: null, playing: false, currentTime: 0 })
  })

  it("después de stop, una resolución tardía no revive nada", async () => {
    const motor = await cargarMotor()
    motor.play("https://ejemplo.local/a.mp3")

    motor.stop()
    creados[0].resolverPlay(0)
    await Promise.resolve()

    expect(motor.getState().playing).toBe(false)
    expect(motor.getState().url).toBeNull()
  })

  it("al terminar una pista avisa y se rebobina", async () => {
    const motor = await cargarMotor()
    const alTerminar = vi.fn()

    motor.play("https://ejemplo.local/a.mp3", { onEnded: alTerminar })
    creados[0].currentTime = 180
    creados[0].emitir("ended")

    expect(alTerminar).toHaveBeenCalledTimes(1)
    expect(creados[0].currentTime).toBe(0)
    expect(motor.getState().playing).toBe(false)
  })
})

describe("motor de audio · suscripción", () => {
  it("avisa al suscribirse y en cada cambio, y deja de avisar al cancelar", async () => {
    const motor = await cargarMotor()
    const vistos: Array<string | null> = []

    const cancelar = motor.subscribe((estado) => vistos.push(estado.url))
    expect(vistos).toEqual([null])

    motor.play("https://ejemplo.local/a.mp3")
    expect(vistos).toContain("https://ejemplo.local/a.mp3")

    cancelar()
    const cuantos = vistos.length
    motor.play("https://ejemplo.local/b.mp3")
    expect(vistos).toHaveLength(cuantos)
  })
})

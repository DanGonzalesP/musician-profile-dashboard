type Listener = (level: number) => void

type TappedElement = HTMLAudioElement & {
  __audioBusSource?: MediaElementAudioSourceNode
  __audioBusAnalyser?: AnalyserNode
}

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sourceEl: HTMLAudioElement | null = null
let dataArray: Uint8Array | null = null
let rafId: number | null = null
const listeners = new Set<Listener>()

function ensureContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function tick() {
  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
    const level = sum / dataArray.length / 255
    listeners.forEach((l) => l(level))
  } else {
    listeners.forEach((l) => l(0))
  }
  rafId = requestAnimationFrame(tick)
}

function ensureLoop() {
  if (rafId === null) rafId = requestAnimationFrame(tick)
}

/**
 * Conecta un <audio> como fuente de análisis de frecuencias para el fondo
 * audio-reactivo. Debe llamarse dentro de un gesto de usuario (click de
 * play), por las políticas de autoplay del navegador.
 *
 * Si el audio viene de un origen sin CORS abierto, el grafo de Web Audio
 * queda "manchado" (tainted) y getByteFrequencyData devuelve ceros en
 * silencio — no lanza error. El fondo simplemente no vibra, pero la
 * reproducción sigue sonando normal porque igual reconectamos hacia
 * destination.
 */
export function setActiveAudio(el: HTMLAudioElement | null) {
  if (typeof window === "undefined") return
  if (sourceEl === el) return
  sourceEl = el

  if (!el) {
    analyser = null
    dataArray = null
    return
  }

  const ctx = ensureContext()
  if (ctx.state === "suspended") ctx.resume().catch(() => {})

  const tapped = el as TappedElement
  try {
    if (!tapped.__audioBusAnalyser) {
      const node = ctx.createMediaElementSource(el)
      const newAnalyser = ctx.createAnalyser()
      newAnalyser.fftSize = 128
      node.connect(newAnalyser)
      newAnalyser.connect(ctx.destination)
      tapped.__audioBusSource = node
      tapped.__audioBusAnalyser = newAnalyser
    }
    analyser = tapped.__audioBusAnalyser
    dataArray = new Uint8Array(analyser.frequencyBinCount)
    ensureLoop()
  } catch (err) {
    console.warn("[audio-bus] No se pudo conectar el analizador de frecuencias:", err)
    analyser = null
    dataArray = null
  }
}

/** Se suscribe al nivel de audio en vivo (0..1). Devuelve la función para cancelar la suscripción. */
export function subscribeAudioLevel(listener: Listener): () => void {
  listeners.add(listener)
  ensureLoop()
  return () => {
    listeners.delete(listener)
  }
}

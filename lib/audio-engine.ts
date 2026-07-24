// Motor de audio global único para toda la plataforma.
//
// Toda la reproducción (discografía, single destacado, feed, preescuchas del
// editor) pasa por UN solo elemento <audio> compartido a nivel de módulo. Eso
// arregla de raíz los problemas que aparecían cuando cada componente creaba su
// propio `new Audio()`:
//
//   1. Nunca suenan dos canciones a la vez — hay un único elemento, así que
//      cargar una nueva pista corta la anterior automáticamente.
//   2. Cambiar de canción rápido (elegir varias seguidas) ya no cuelga ni deja
//      audios "zombie" sonando de fondo: un contador de generación (token)
//      ignora las resoluciones tardías de play()/load() de la pista anterior.
//   3. Menos latencia al reproducir: el elemento se reutiliza y se mantiene
//      "caliente" en vez de recrearse en cada click.
//
// A propósito NO se enruta el audio por Web Audio (createMediaElementSource):
// para leer las frecuencias haría falta crossOrigin="anonymous", y si el host
// (R2) no responde con cabeceras CORS, el navegador o bien falla la carga o
// bien silencia la salida al pasarla por el grafo. Como la reproducción sin
// fallos es la prioridad, el fondo audio-reactivo se alimenta de un nivel
// sintético (ver levelLoop) en vez de las frecuencias reales — se ve igual de
// vivo y funciona con cualquier configuración de CORS.

import { setAudioLevel } from "./audio-bus"

export interface AudioEngineState {
  /** URL de la pista actualmente cargada, o null si no hay ninguna. */
  url: string | null
  playing: boolean
  currentTime: number
  duration: number
}

type StateListener = (state: AudioEngineState) => void

let el: HTMLAudioElement | null = null
// Se incrementa en cada nueva orden de reproducción. Cualquier callback
// asíncrono (la promesa de play(), un evento de un src ya reemplazado) que no
// coincida con el token vigente se descarta: así una pista vieja no puede
// "revivir" ni pisar a la nueva.
let token = 0
let onEndedCb: (() => void) | null = null

let state: AudioEngineState = { url: null, playing: false, currentTime: 0, duration: 0 }
const listeners = new Set<StateListener>()

// ── Nivel sintético para el fondo audio-reactivo ──────────────────────────
let levelRaf: number | null = null
let smoothedLevel = 0

function levelLoop() {
  if (!state.playing) {
    // Decaimiento suave hasta 0 cuando está en pausa o detenido.
    smoothedLevel *= 0.9
    setAudioLevel(smoothedLevel)
    if (smoothedLevel < 0.01) {
      smoothedLevel = 0
      setAudioLevel(0)
      levelRaf = null
      return
    }
    levelRaf = requestAnimationFrame(levelLoop)
    return
  }
  // Pulso pseudo-musical mientras suena: caminata aleatoria suavizada, para
  // que el fondo "respire" sin depender de leer las muestras reales.
  const target = 0.3 + Math.random() * 0.5
  smoothedLevel += (target - smoothedLevel) * 0.15
  setAudioLevel(smoothedLevel)
  levelRaf = requestAnimationFrame(levelLoop)
}

function ensureLevelLoop() {
  if (levelRaf === null) levelRaf = requestAnimationFrame(levelLoop)
}

function notify() {
  listeners.forEach((l) => l(state))
}

function setState(patch: Partial<AudioEngineState>) {
  state = { ...state, ...patch }
  notify()
}

function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null
  if (el) return el
  const audio = new Audio()
  audio.preload = "auto"
  audio.addEventListener("timeupdate", () => setState({ currentTime: audio.currentTime }))
  audio.addEventListener("loadedmetadata", () => setState({ duration: audio.duration || 0 }))
  audio.addEventListener("durationchange", () => setState({ duration: audio.duration || 0 }))
  audio.addEventListener("play", () => {
    setState({ playing: true })
    ensureLevelLoop()
  })
  audio.addEventListener("pause", () => setState({ playing: false }))
  audio.addEventListener("ended", () => {
    // Se rebobina a 0 para que un próximo Play sobre la misma pista arranque
    // desde el inicio en vez de quedar pegado al final.
    try {
      audio.currentTime = 0
    } catch {}
    setState({ playing: false, currentTime: 0 })
    const cb = onEndedCb
    if (cb) cb()
  })
  el = audio
  return el
}

function safePlay(element: HTMLAudioElement, myToken: number) {
  const p = element.play()
  if (p && typeof p.then === "function") {
    p.then(() => {
      if (token === myToken) {
        setState({ playing: true })
        ensureLevelLoop()
      }
    }).catch(() => {
      // Rechazo típico (AbortError) cuando se cambia de src antes de que
      // resuelva play(): si ya no somos la reproducción vigente, se ignora
      // en silencio en vez de dejar el botón atascado.
      if (token === myToken) setState({ playing: false })
    })
  }
}

/**
 * Reproduce una URL. Si esa misma URL ya está cargada, reanuda donde quedó
 * (no reinicia). Si es otra, corta la anterior y arranca la nueva desde 0.
 */
export function play(url: string, opts?: { onEnded?: () => void }) {
  const element = getEl()
  if (!element) return
  onEndedCb = opts?.onEnded ?? null

  const myToken = ++token

  if (state.url === url) {
    safePlay(element, myToken)
    return
  }

  setState({ url, playing: false, currentTime: 0, duration: 0 })
  element.src = url
  try {
    element.currentTime = 0
  } catch {}
  safePlay(element, myToken)
}

export function pause() {
  if (!el) return
  el.pause()
  setState({ playing: false })
}

/** Reanuda la pista ya cargada. Opcionalmente re-registra el callback onEnded. */
export function resume(opts?: { onEnded?: () => void }) {
  if (!el || !state.url) return
  if (opts && "onEnded" in opts) onEndedCb = opts.onEnded ?? null
  const myToken = ++token
  safePlay(el, myToken)
}

/**
 * Alterna play/pausa para una URL. Si ya es la pista actual, pausa o reanuda;
 * si es otra, la carga y reproduce.
 */
export function toggle(url: string, opts?: { onEnded?: () => void }) {
  if (state.url === url) {
    if (state.playing) pause()
    else resume(opts)
  } else {
    play(url, opts)
  }
}

export function seek(time: number) {
  if (!el) return
  try {
    el.currentTime = time
  } catch {}
  setState({ currentTime: time })
}

/** Detiene y descarga la pista actual por completo. */
export function stop() {
  token++
  onEndedCb = null
  if (el) {
    el.pause()
    el.removeAttribute("src")
    try {
      el.load()
    } catch {}
  }
  setState({ url: null, playing: false, currentTime: 0, duration: 0 })
}

export function isCurrent(url: string): boolean {
  return state.url === url
}

export function getState(): AudioEngineState {
  return state
}

export function subscribe(listener: StateListener): () => void {
  listeners.add(listener)
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}

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
  error?: string | null
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
  audio.addEventListener("timeupdate", () => {
    if (state.url) setState({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 })
  })
  const updateDuration = () => {
    if (state.url) setState({ duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0 })
  }
  audio.addEventListener("loadedmetadata", updateDuration)
  audio.addEventListener("durationchange", updateDuration)
  audio.addEventListener("play", () => {
    // Los eventos ya encolados pueden llegar tras pause/stop/cambio de fuente.
    if (!state.url || audio.paused) return
    setState({ playing: true })
    ensureLevelLoop()
  })
  audio.addEventListener("pause", () => {
    if (audio.paused) setState({ playing: false })
  })
  audio.addEventListener("error", () => {
    if (state.url && audio.error) setState({ playing: false, error: "No se pudo reproducir el audio. Comprueba tu conexión o vuelve a intentarlo." })
  })
  audio.addEventListener("ended", () => {
    if (!state.url || !audio.ended) return
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

// Silencia cualquier otro <audio>/<video> AUDIBLE del DOM cuando el motor
// arranca. Garantiza "una sola cosa suena a la vez en la plataforma" incluso
// para superficies que no pasan por el motor —el visor de video de
// Publicaciones (MediaViewer) reproduce con sonido por su cuenta—. No toca
// medios muteados (miniaturas decorativas del feed, que solo animan) ni el
// propio elemento del motor, que no vive en el DOM.
function pauseForeignMedia() {
  if (typeof document === "undefined") return
  document.querySelectorAll("video, audio").forEach((node) => {
    const media = node as HTMLMediaElement
    if (media !== el && !media.paused && !media.muted) media.pause()
  })
}

function safePlay(element: HTMLAudioElement, myToken: number) {
  pauseForeignMedia()
  // Un fallo de descarga/decodificación deja el elemento en error. Recargar
  // la misma fuente permite un reintento real sin crear otro reproductor.
  if (element.error) {
    element.load()
    setState({ currentTime: 0, duration: 0 })
  }
  const p = element.play()
  if (p && typeof p.then === "function") {
    p.then(() => {
      if (token === myToken && !element.paused && state.url) {
        setState({ playing: true })
        ensureLevelLoop()
      }
    }).catch(() => {
      // Rechazo típico (AbortError) cuando se cambia de src antes de que
      // resuelva play(): si ya no somos la reproducción vigente, se ignora
      // en silencio en vez de dejar el botón atascado.
      if (token === myToken) setState({ playing: false, error: "No se pudo iniciar el audio. Pulsa reproducir para volver a intentarlo." })
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
  setState({ error: null })

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
  // Una promesa play anterior no debe volver a marcar reproducción tras pausar.
  token++
  if (!el) return
  el.pause()
  setState({ playing: false })
}

/** Reanuda la pista ya cargada. Opcionalmente re-registra el callback onEnded. */
export function resume(opts?: { onEnded?: () => void }) {
  if (!el || !state.url) return
  setState({ error: null })
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
  if (!el || !state.url || !Number.isFinite(time)) return
  const duration = el.duration
  const target = Math.max(0, Number.isFinite(duration) && duration >= 0 ? Math.min(time, duration) : time)
  try {
    el.currentTime = target
    // Reflejar la posición aceptada por el navegador, no una asignación fallida.
    setState({ currentTime: el.currentTime })
  } catch { /* Conserva la posición anterior si el medio aún no permite buscar. */ }
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
  setState({ url: null, playing: false, currentTime: 0, duration: 0, error: null })
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

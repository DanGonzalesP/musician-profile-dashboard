// Difusor del nivel de audio en vivo (0..1) para el fondo audio-reactivo.
//
// Antes esto abría un AudioContext y leía frecuencias reales del <audio> vía
// createMediaElementSource. Eso obligaba a usar crossOrigin="anonymous", que
// rompía la reproducción cuando el host del audio (R2) no mandaba cabeceras
// CORS. Ahora el nivel lo empuja el motor de audio (lib/audio-engine) con un
// pulso sintético mientras suena algo — el fondo se ve igual de vivo y la
// reproducción nunca depende de CORS.

type Listener = (level: number) => void

const listeners = new Set<Listener>()
let currentLevel = 0

/** Se suscribe al nivel de audio en vivo (0..1). Devuelve la función para cancelar. */
export function subscribeAudioLevel(listener: Listener): () => void {
  listeners.add(listener)
  listener(currentLevel)
  return () => {
    listeners.delete(listener)
  }
}

/** Lo llama el motor de audio para publicar el nivel actual a los suscriptores. */
export function setAudioLevel(level: number): void {
  currentLevel = level
  listeners.forEach((l) => l(level))
}

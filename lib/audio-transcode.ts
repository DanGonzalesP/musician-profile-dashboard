// Transcodifica cualquier audio sin comprimir (wav, flac, aiff, etc.) a MP3
// antes de subirlo — corre en el navegador vía ffmpeg.wasm, así no depende
// de un servidor con ffmpeg instalado (Vercel serverless no lo trae, y
// subirlo como binario ahí tiene límites de tamaño de función).
//
// Se usa el core "single-thread" de ffmpeg.wasm (no el "-mt") a propósito:
// el core multi-thread necesita que la página entera esté en modo
// "cross-origin isolated" (headers COOP/COEP), lo que rompería la carga de
// imágenes/audio de Supabase y R2 en <img>/<audio> en el resto de la app.
// El single-thread es más lento pero no requiere esos headers.
import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"

// Formatos que ya vienen en un contenedor mp3/aac/m4a válido y reproducible en
// cualquier navegador — no hace falta re-procesarlos.
//
// A propósito NO se incluyen "mpeg"/"mp2": aunque a veces son un mp3 mal
// nombrado, otras veces son un contenedor MPEG real que <audio> no reproduce.
// Para que TODO lo que se publica sea mp3 de verdad (y suene en cualquier
// lado), esas extensiones sí pasan por ffmpeg y salen como .mp3.
export const COMPRESSED_AUDIO_EXTS = new Set(["mp3", "aac", "m4a"])

export type AudioBitrate = "192k" | "256k" | "320k"
export const DEFAULT_AUDIO_BITRATE: AudioBitrate = "320k"

let ffmpegSingleton: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null
let operations: Promise<unknown> = Promise.resolve()

function discardWorker(ffmpeg: FFmpeg) {
  ffmpeg.terminate()
  if (ffmpegSingleton === ffmpeg) { ffmpegSingleton = null; loadPromise = null }
}

/** Terminar el worker, no sólo rechazar la espera: así la siguiente operación
 * serializada no hereda un motor bloqueado ni archivos de una conversión fallida. */
async function withWorkerDeadline<T>(ffmpeg: FFmpeg, milliseconds: number, operation: (signal: AbortSignal) => Promise<T>, cancellation?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    cancellation?.throwIfAborted()
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => {
        controller.abort()
        discardWorker(ffmpeg)
        reject(new DOMException("Preparación de audio cancelada.", "AbortError"))
      }
      cancellation?.addEventListener("abort", abort, { once: true })
    })
    return await Promise.race([
      operation(controller.signal),
      cancelled,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          discardWorker(ffmpeg)
          reject(new Error("La preparación del audio tardó demasiado. Conserva el archivo y vuelve a intentarlo."))
        }, milliseconds)
      }),
    ])
  } catch (error) {
    controller.abort()
    discardWorker(ffmpeg)
    throw error
  } finally {
    clearTimeout(timer)
    if (abort) cancellation?.removeEventListener("abort", abort)
  }
}

async function coreAsset(path: string, type: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new Error("No se pudo cargar el conversor de audio.")
  const bytes = await response.arrayBuffer()
  signal.throwIfAborted()
  return URL.createObjectURL(new Blob([bytes], { type }))
}

// El core y su filesystem son compartidos. Serializar también las sondas
// evita mezclar output.mp3, eventos de progreso y Duration entre dos archivos.
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation)
  operations = result.catch(() => undefined)
  return result
}

async function getFFmpeg(cancellation?: AbortSignal): Promise<FFmpeg> {
  cancellation?.throwIfAborted()
  if (ffmpegSingleton) return ffmpegSingleton
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      await withWorkerDeadline(ffmpeg, 120_000, async signal => {
        const urls: string[] = []
        try {
          const coreURL = await coreAsset("/ffmpeg/ffmpeg-core.js", "text/javascript", signal)
          urls.push(coreURL)
          const wasmURL = await coreAsset("/ffmpeg/ffmpeg-core.wasm", "application/wasm", signal)
          urls.push(wasmURL)
          signal.throwIfAborted()
          await ffmpeg.load({ coreURL, wasmURL }, { signal })
          signal.throwIfAborted()
        } finally {
          urls.forEach(url => URL.revokeObjectURL(url))
        }
      }, cancellation)
      ffmpegSingleton = ffmpeg
      return ffmpeg
    })().catch((error) => { loadPromise = null; throw error })
  }
  return loadPromise
}

/**
 * Si el archivo ya es mp3/aac/m4a, lo devuelve tal cual (ya está
 * comprimido, no hace falta re-procesarlo — su bitrate original queda como
 * está, el selector de calidad solo aplica a la conversión desde un formato
 * sin comprimir). Si es otro formato de audio (wav, flac, aiff, ogg, etc.),
 * lo convierte a MP3 en el bitrate indicado (por defecto 320kbps).
 */
export async function ensureCompressedAudio(
  file: File,
  bitrate: AudioBitrate = DEFAULT_AUDIO_BITRATE,
  onProgress?: (ratio: number) => void,
  cancellation?: AbortSignal
): Promise<File> {
  cancellation?.throwIfAborted()
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  if (COMPRESSED_AUDIO_EXTS.has(ext)) return file

  return exclusive(async () => {
  cancellation?.throwIfAborted()
  const ffmpeg = await getFFmpeg(cancellation)
  return withWorkerDeadline(ffmpeg, 600_000, async signal => {
  const inputName = `input.${ext || "wav"}`
  const outputName = "output.mp3"

  const onFFmpegProgress = ({ progress }: { progress: number }) => {
    if (!signal.aborted && onProgress && Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)))
  }
  if (onProgress) ffmpeg.on("progress", onFFmpegProgress)

  try {
    const input = await fetchFile(file)
    signal.throwIfAborted()
    await ffmpeg.writeFile(inputName, input, { signal })
    const code = await ffmpeg.exec(["-i", inputName, "-c:a", "libmp3lame", "-b:a", bitrate, outputName], 600_000, { signal })
    if (code !== 0) throw new Error("No se pudo convertir el audio.")
    const data = await ffmpeg.readFile(outputName, "binary", { signal })
    signal.throwIfAborted()
    if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new Error("La conversión no produjo un audio válido.")
    const mp3Name = file.name.replace(/\.\w+$/, "") + ".mp3"
    return new File([data as Uint8Array<ArrayBuffer>], mp3Name, { type: "audio/mpeg" })
  } finally {
    if (onProgress) ffmpeg.off("progress", onFFmpegProgress)
    // Limpieza best-effort: si el archivo nunca se llegó a escribir (falló
    // fetchFile/writeFile), deleteFile tira error — no debe tapar el error real.
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
  }, cancellation)
  })
}

/**
 * Duración exacta leída de los metadatos reales del archivo (vía ffmpeg),
 * en vez de <audio>.duration en el navegador — para mp3 con bitrate
 * variable o tags ID3, Chrome estima esa duración buscando cerca del final
 * del archivo y puede errar por varios segundos. ffmpeg lee el header real.
 */
export async function getAccurateAudioDuration(file: File, cancellation?: AbortSignal): Promise<number | null> {
  return exclusive(async () => {
  cancellation?.throwIfAborted()
  const ffmpeg = await getFFmpeg(cancellation)
  return withWorkerDeadline(ffmpeg, 60_000, async signal => {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase()
  const inputName = `probe.${ext}`

  let durationSeconds: number | null = null
  const parseLog = ({ message }: { message: string }) => {
    const match = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (match) {
      const [, h, m, s] = match
      durationSeconds = Number(h) * 3600 + Number(m) * 60 + Number(s)
    }
  }

  ffmpeg.on("log", parseLog)
  try {
    const input = await fetchFile(file)
    signal.throwIfAborted()
    await ffmpeg.writeFile(inputName, input, { signal })
    try {
      // "-f null -" descarta la salida: solo interesa el log de metadata
      // que ffmpeg imprime al abrir el archivo, no hace falta re-codificar.
      await ffmpeg.exec(["-i", inputName, "-t", "0", "-f", "null", "-"], 60_000, { signal })
    } catch {
      // Algunos archivos hacen que ffmpeg termine con código de error
      // igual habiendo logueado el Duration antes — no es un fallo real acá.
    }
    signal.throwIfAborted()
    return durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null
  } catch {
    discardWorker(ffmpeg)
    return null
  } finally {
    ffmpeg.off("log", parseLog)
    await ffmpeg.deleteFile(inputName).catch(() => {})
  }
  }, cancellation)
  }).catch(() => { cancellation?.throwIfAborted(); return null })
}

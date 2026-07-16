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
import { fetchFile, toBlobURL } from "@ffmpeg/util"

// "mpeg"/"mp2" cubren archivos como "cancion.mp3.mpeg" — el navegador a
// veces les asigna esa extensión al descargarlos/re-guardarlos, pero el
// contenido sigue siendo mp3 comprimido: no hay que retranscodificarlos.
export const COMPRESSED_AUDIO_EXTS = new Set(["mp3", "aac", "m4a", "mpeg", "mp2"])

let ffmpegSingleton: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      const baseURL = "/ffmpeg"
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      })
      ffmpegSingleton = ffmpeg
      return ffmpeg
    })()
  }
  return loadPromise
}

/**
 * Si el archivo ya es mp3/aac/m4a, lo devuelve tal cual (ya está
 * comprimido, no hace falta re-procesarlo). Si es otro formato de audio
 * (wav, flac, aiff, ogg, etc.), lo convierte a MP3 192kbps.
 */
export async function ensureCompressedAudio(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<File> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  if (COMPRESSED_AUDIO_EXTS.has(ext)) return file

  const ffmpeg = await getFFmpeg()
  const inputName = `input.${ext || "wav"}`
  const outputName = "output.mp3"

  const onFFmpegProgress = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.min(1, Math.max(0, progress)))
  }
  if (onProgress) ffmpeg.on("progress", onFFmpegProgress)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    await ffmpeg.exec(["-i", inputName, "-c:a", "libmp3lame", "-b:a", "192k", outputName])
    const data = await ffmpeg.readFile(outputName)
    const mp3Name = file.name.replace(/\.\w+$/, "") + ".mp3"
    return new File([data as Uint8Array], mp3Name, { type: "audio/mpeg" })
  } finally {
    if (onProgress) ffmpeg.off("progress", onFFmpegProgress)
    // Limpieza best-effort: si el archivo nunca se llegó a escribir (falló
    // fetchFile/writeFile), deleteFile tira error — no debe tapar el error real.
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}

/**
 * Duración exacta leída de los metadatos reales del archivo (vía ffmpeg),
 * en vez de <audio>.duration en el navegador — para mp3 con bitrate
 * variable o tags ID3, Chrome estima esa duración buscando cerca del final
 * del archivo y puede errar por varios segundos. ffmpeg lee el header real.
 */
export async function getAccurateAudioDuration(file: File): Promise<number | null> {
  const ffmpeg = await getFFmpeg()
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
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    try {
      // "-f null -" descarta la salida: solo interesa el log de metadata
      // que ffmpeg imprime al abrir el archivo, no hace falta re-codificar.
      await ffmpeg.exec(["-i", inputName, "-f", "null", "-"])
    } catch {
      // Algunos archivos hacen que ffmpeg termine con código de error
      // igual habiendo logueado el Duration antes — no es un fallo real acá.
    }
    return durationSeconds
  } catch {
    return null
  } finally {
    ffmpeg.off("log", parseLog)
    await ffmpeg.deleteFile(inputName).catch(() => {})
  }
}

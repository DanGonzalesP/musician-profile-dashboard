// Validación pura de una solicitud de URL de subida (app/api/upload-url).
//
// Vive aparte de la ruta a propósito: la ruta hace I/O (firma R2, escribe en
// Supabase) y no se puede probar sin red; esta función es pura y determinista,
// así que las reglas que impiden subir contenido arbitrario o archivos
// gigantes tienen pruebas de regresión de verdad (ver upload-validation.test.ts).
//
// Cambiar cualquier límite o mapeo aquí cambia lo que la ruta acepta: es el
// único lugar donde se decide qué llega a firmarse hacia el bucket público.

export const ALLOWED_FOLDERS = ["images", "audio", "video"] as const
export type UploadFolder = (typeof ALLOWED_FOLDERS)[number]

// Techo por carpeta. Frena que un cliente pida firmar una subida enorme: la
// firma lleva ContentLength (ver la ruta), así que R2 rechaza el PUT si el
// navegador manda más bytes de los declarados aquí.
export const MAX_BYTES_BY_FOLDER: Record<UploadFolder, number> = {
  images: 5 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 200 * 1024 * 1024,
}

// Extensión → content types multimedia aceptables. Que la extensión y el MIME
// coincidan evita el truco de pedir `foo.html` con content-type de imagen (o al
// revés) para hospedar algo interpretable en un bucket público. Cada extensión
// admite todos los MIME que los navegadores usan en la práctica para ese
// formato, para no rechazar subidas legítimas por diferencias entre navegadores.
export const CONTENT_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  mp3: ["audio/mpeg"],
  mpeg: ["audio/mpeg"],
  mpg: ["audio/mpeg"],
  mp2: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  ogg: ["audio/ogg"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  aac: ["audio/aac"],
  flac: ["audio/flac", "audio/x-flac"],
  aiff: ["audio/aiff", "audio/x-aiff"],
  aif: ["audio/aiff", "audio/x-aiff"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mov: ["video/quicktime"],
}

// Solo multimedia — nunca HTML/JS/ejecutables, aunque el bucket sea público:
// el navegador nunca debe interpretar una subida como código.
const ALLOWED_CONTENT_TYPES = /^(image|audio|video)\//

export type UploadValidationResult =
  | { ok: true; folder: UploadFolder; safeExt: string; contentType: string; bytes: number }
  | { ok: false; error: string }

/**
 * Aplica, en el mismo orden que la ruta, todas las reglas que deciden si una
 * solicitud de subida es aceptable. No toca red ni credenciales.
 */
export function validateUploadRequest(input: {
  folder: unknown
  extension: unknown
  contentType: unknown
  bytes: unknown
}): UploadValidationResult {
  const { folder, extension, contentType, bytes } = input

  if (typeof folder !== "string" || !(ALLOWED_FOLDERS as readonly string[]).includes(folder)) {
    return { ok: false, error: "Carpeta de destino inválida" }
  }
  const folderKey = folder as UploadFolder

  if (typeof contentType !== "string" || !ALLOWED_CONTENT_TYPES.test(contentType)) {
    return { ok: false, error: "Tipo de archivo no permitido" }
  }

  const safeExt =
    String(extension ?? "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin"

  const allowedTypes = CONTENT_TYPES_BY_EXTENSION[safeExt]
  if (!allowedTypes?.includes(contentType)) {
    return { ok: false, error: "La extensión y el tipo de archivo no coinciden" }
  }

  if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_BYTES_BY_FOLDER[folderKey]) {
    return { ok: false, error: "El tamaño del archivo no es válido o supera el límite permitido" }
  }

  return { ok: true, folder: folderKey, safeExt, contentType, bytes }
}

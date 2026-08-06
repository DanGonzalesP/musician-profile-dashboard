import { describe, it, expect } from "vitest"
import { validateUploadRequest, MAX_BYTES_BY_FOLDER } from "./upload-validation"

// Pruebas de la puerta que decide qué llega a firmarse hacia el bucket público
// de R2. El bucket es de lectura pública, así que aceptar de más aquí es dejar
// que alguien hospede contenido arbitrario o llene el almacenamiento.

describe("validateUploadRequest — subidas legítimas", () => {
  it("acepta una imagen webp dentro del límite", () => {
    const r = validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: 400_000 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.folder).toBe("images")
      expect(r.safeExt).toBe("webp")
      expect(r.contentType).toBe("image/webp")
    }
  })

  it("acepta los formatos de audio que el editor produce (incluido .mpg y .mp2)", () => {
    for (const [extension, contentType] of [
      ["mp3", "audio/mpeg"],
      ["mpeg", "audio/mpeg"],
      ["mpg", "audio/mpeg"],
      ["mp2", "audio/mpeg"],
      ["wav", "audio/wav"],
      ["ogg", "audio/ogg"],
      ["m4a", "audio/mp4"],
      ["aac", "audio/aac"],
      ["flac", "audio/flac"],
      ["aiff", "audio/aiff"],
      ["aif", "audio/aiff"],
    ] as const) {
      const r = validateUploadRequest({ folder: "audio", extension, contentType, bytes: 3_000_000 })
      expect(r.ok, `${extension} → ${contentType}`).toBe(true)
    }
  })

  it("tolera los MIME alternativos que reportan algunos navegadores (Safari)", () => {
    // Safari suele reportar audio/x-m4a y audio/x-wav; rechazarlos rebota
    // subidas legítimas por una diferencia entre navegadores, no por seguridad.
    expect(validateUploadRequest({ folder: "audio", extension: "m4a", contentType: "audio/x-m4a", bytes: 1000 }).ok).toBe(true)
    expect(validateUploadRequest({ folder: "audio", extension: "wav", contentType: "audio/x-wav", bytes: 1000 }).ok).toBe(true)
    expect(validateUploadRequest({ folder: "audio", extension: "flac", contentType: "audio/x-flac", bytes: 1000 }).ok).toBe(true)
  })

  it("acepta video mp4 en el límite exacto", () => {
    const r = validateUploadRequest({ folder: "video", extension: "mp4", contentType: "video/mp4", bytes: MAX_BYTES_BY_FOLDER.video })
    expect(r.ok).toBe(true)
  })
})

describe("validateUploadRequest — rechazos de seguridad", () => {
  it("rechaza una carpeta fuera de la lista blanca", () => {
    for (const folder of ["", "scripts", "..", "images/../secrets", 42, null, undefined]) {
      const r = validateUploadRequest({ folder, extension: "webp", contentType: "image/webp", bytes: 1000 })
      expect(r.ok, String(folder)).toBe(false)
    }
  })

  it("rechaza tipos no multimedia aunque la extensión parezca inocente", () => {
    const r = validateUploadRequest({ folder: "images", extension: "png", contentType: "text/html", bytes: 1000 })
    expect(r).toEqual({ ok: false, error: "Tipo de archivo no permitido" })
  })

  it("rechaza contentType ausente o de otro tipo (no cae a octet-stream)", () => {
    expect(validateUploadRequest({ folder: "images", extension: "png", contentType: undefined, bytes: 1000 }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "png", contentType: "", bytes: 1000 }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "png", contentType: 123, bytes: 1000 }).ok).toBe(false)
  })

  it("rechaza cuando la extensión y el MIME no concuerdan (foto que dice ser audio)", () => {
    const r = validateUploadRequest({ folder: "images", extension: "png", contentType: "audio/mpeg", bytes: 1000 })
    expect(r).toEqual({ ok: false, error: "La extensión y el tipo de archivo no coinciden" })
  })

  it("rechaza un content-type multimedia con una extensión desconocida", () => {
    // "image/svg+xml" es multimedia por el regex, pero svg puede llevar script
    // y no está en el mapa: sin extensión conocida, no se firma.
    const r = validateUploadRequest({ folder: "images", extension: "svg", contentType: "image/svg+xml", bytes: 1000 })
    expect(r.ok).toBe(false)
  })

  it("rechaza tamaños inválidos o por encima del techo de la carpeta", () => {
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: 0 }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: -5 }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: 1.5 }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: Number.NaN }).ok).toBe(false)
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: "1000" }).ok).toBe(false)
    // 1 byte por encima del límite de imágenes.
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes: MAX_BYTES_BY_FOLDER.images + 1 }).ok).toBe(false)
  })

  it("aplica el límite por carpeta: un audio de 8 MB pasa, esa misma imagen no", () => {
    const bytes = 8 * 1024 * 1024
    expect(validateUploadRequest({ folder: "audio", extension: "mp3", contentType: "audio/mpeg", bytes }).ok).toBe(true)
    expect(validateUploadRequest({ folder: "images", extension: "webp", contentType: "image/webp", bytes }).ok).toBe(false)
  })

  it("normaliza la extensión antes de compararla (no se cuela ../ ni mayúsculas)", () => {
    // "PNG" → "png" y sigue siendo válido con image/png.
    expect(validateUploadRequest({ folder: "images", extension: "PNG", contentType: "image/png", bytes: 1000 }).ok).toBe(true)
    // Una extensión con basura se limpia a "png" y valida contra su MIME real.
    expect(validateUploadRequest({ folder: "images", extension: "p!n@g", contentType: "image/png", bytes: 1000 }).ok).toBe(true)
  })
})

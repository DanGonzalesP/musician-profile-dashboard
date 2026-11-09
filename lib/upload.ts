import imageCompression from "browser-image-compression"
import { createVerifiedUploadAttempt } from "@/lib/upload-protocol"
import { supabase } from "@/lib/supabase"
import { UploadFeedbackError } from "@/lib/upload-feedback"

const imageAttempts = new WeakMap<File, Map<string, Promise<() => Promise<string>>>>()

// Subida DIRECTA e inmediata de una imagen a R2 (vía /api/upload-url) para
// los paneles de administración (merch/servicios), donde no existe el ciclo
// blob-URL → publicar del editor visual. Comprime a WebP igual que
// profile-editor y devuelve la URL pública permanente.

export async function uploadImageNow(file: File, expectedOwnerUserId?: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new UploadFeedbackError("Inicia sesión con la cuenta original para subir la imagen.")
  const owner = data.session.user.id
  if (expectedOwnerUserId && owner !== expectedOwnerUserId) {
    throw new UploadFeedbackError("La cuenta cambió. Vuelve a abrir el formulario con la cuenta original.")
  }
  let attempts = imageAttempts.get(file)
  if (!attempts) { attempts = new Map(); imageAttempts.set(file, attempts) }
  const ownerAttempts = attempts
  let prepared = ownerAttempts.get(owner)
  if (!prepared) {
    prepared = prepareImageAttempt(file, owner)
    ownerAttempts.set(owner, prepared)
    // Un fallo de preparación no debe impedir otro intento con el mismo File.
    void prepared.catch(() => { if (ownerAttempts.get(owner) === prepared) ownerAttempts.delete(owner) })
  }
  const run = await prepared
  return run()
}

async function prepareImageAttempt(file: File, owner: string): Promise<() => Promise<string>> {
  let uploadFile = file
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.82,
    })
    uploadFile = new File([compressed], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" })
  } catch {
    // Si la compresión falla, se sube el original.
  }

  const contentType = uploadFile.type || "image/webp"
  const body = uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType })
  return createVerifiedUploadAttempt(body, "images", owner)
}

import imageCompression from "browser-image-compression"
import { authedFetch } from "@/lib/authed-fetch"

// Subida DIRECTA e inmediata de una imagen a R2 (vía /api/upload-url) para
// los paneles de administración (merch/servicios), donde no existe el ciclo
// blob-URL → publicar del editor visual. Comprime a WebP igual que
// profile-editor y devuelve la URL pública permanente.

export async function uploadImageNow(file: File): Promise<string> {
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

  const ext = (uploadFile.name.split(".").pop() ?? "webp").toLowerCase()
  const contentType = uploadFile.type || "image/webp"

  const presignRes = await authedFetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "images", extension: ext, contentType }),
  })
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}))
    throw new Error(body.error ?? "No se pudo iniciar la subida de la imagen.")
  }
  const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: uploadFile,
  })
  if (!putRes.ok) throw new Error("No se pudo subir la imagen al almacenamiento.")

  return publicUrl
}

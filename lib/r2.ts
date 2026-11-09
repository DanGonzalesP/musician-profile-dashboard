// Cliente de Cloudflare R2 (compatible con la API de S3). Solo se usa
// server-side (API routes) — las credenciales nunca deben llegar al bundle
// del navegador, por eso NO llevan prefijo NEXT_PUBLIC_.
import { S3Client } from "@aws-sdk/client-s3"

export const r2Client = new S3Client({
  region: "auto",
  // La firma se genera antes de recibir el cuerpo (PUT directo del navegador).
  // El checksum automático de un Body ausente representa cero bytes y haría
  // incompatible la firma con el archivo real. Se verificará tamaño/ETag al finalizar.
  requestChecksumCalculation: "WHEN_REQUIRED",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!
// Origen histórico: permite reconocer URLs persistidas antes de la entrega
// privada. Los renders las convierten a /api/media; no habilita lectura R2.
export const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ""

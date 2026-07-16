// Cliente de Cloudflare R2 (compatible con la API de S3). Solo se usa
// server-side (API routes) — las credenciales nunca deben llegar al bundle
// del navegador, por eso NO llevan prefijo NEXT_PUBLIC_.
import { S3Client } from "@aws-sdk/client-s3"

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!
// Esta sí es pública a propósito: es la URL desde donde cualquiera puede
// leer (GET) los archivos ya subidos, se usa en <img>/<audio> del perfil.
export const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!

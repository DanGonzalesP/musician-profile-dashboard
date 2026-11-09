// Configuracion S3 de CORS para un destino elegido expresamente en el entorno.
// Requiere permiso administrativo; la credencial runtime de objetos no basta.
// Staging: preferir la regla y el comando fijados en docs/staging.md (Wrangler).
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3"
import { existsSync, readFileSync } from "node:fs"
import { crearPoliticaCors } from "./r2-cors-policy.mjs"

const envPath = new URL("../.env.local", import.meta.url)
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const match = rawLine.replace(/\r$/, "").match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) process.env[match[1]] ??= match[2].replace(/^"|"$/g, "")
  }
}

try {
  // Validar antes de abrir el cliente o enviar nada al proveedor.
  const policy = crearPoliticaCors(process.env.NEXT_PUBLIC_SITE_URL)
  const account = process.env.R2_ACCOUNT_ID
  const endpoint = `https://${account}.r2.cloudflarestorage.com`
  if (!/^[a-f0-9]{32}$/.test(account ?? "") || process.env.R2_ENDPOINT !== endpoint ||
      !process.env.R2_BUCKET_NAME || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Configuracion R2 incompleta o incompatible")
  }
  const client = new S3Client({region: "auto", endpoint,
    credentials: {accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY},
  })
  try {
    await client.send(new PutBucketCorsCommand({Bucket: process.env.R2_BUCKET_NAME, CORSConfiguration: policy}))
    console.log("CORS configurado para el origen exacto indicado.")
  } finally { client.destroy() }
} catch {
  // No imprimir errores del proveedor, variables, endpoints ni credenciales.
  console.error("No se configuro CORS. Revisa destino, origen exacto y permisos administrativos.")
  process.exitCode = 1
}

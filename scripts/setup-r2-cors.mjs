// Configura el CORS del bucket de R2 para permitir que el navegador suba
// archivos directo (PUT) usando las URLs firmadas que genera
// app/api/upload-url/route.ts. Sin esto, el navegador bloquea el PUT por
// política de origen cruzado (CORS) antes de que llegue a R2.
//
// Se corre una sola vez (o de nuevo si cambia el dominio de producción):
//   node scripts/setup-r2-cors.mjs
//
// Requiere un token de R2 con permiso "Admin Read & Write" (el de "Object
// Read & Write" que ya tenemos en .env.local no alcanza para configurar
// CORS). Si no querés crear un token nuevo solo para esto, aplicá la misma
// regla a mano desde el dashboard: bucket > Settings > CORS Policy > Add
// CORS policy, pegando el array de CORSRules de abajo.
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3"
import { readFileSync } from "node:fs"

// Carga las variables de .env.local a mano (este script corre fuera de Next.js).
const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
for (const rawLine of envFile.split("\n")) {
  const line = rawLine.replace(/\r$/, "")
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (match) process.env[match[1]] ??= match[2].replace(/^"|"$/g, "")
}

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

await client.send(
  new PutBucketCorsCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["http://localhost:3000", "https://*.vercel.app"],
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
)

console.log(`CORS configurado en el bucket "${process.env.R2_BUCKET_NAME}".`)

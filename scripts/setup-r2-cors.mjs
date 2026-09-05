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

// El dominio de produccion no se escribe a mano: sale de la misma variable
// que ya usa la app para sus URLs canonicas, asi no hay dos fuentes de verdad
// que puedan discrepar.
function origenesPermitidos() {
  const base = ["http://localhost:3000", "https://*.workers.dev"]
  const sitio = process.env.NEXT_PUBLIC_SITE_URL
  if (!sitio) return base
  try {
    const { origin } = new URL(sitio)
    return base.includes(origin) ? base : [...base, origin]
  } catch {
    // Una variable mal formada no debe tumbar el script ni, peor, colarse
    // como origen invalido en la politica del bucket.
    console.warn(`NEXT_PUBLIC_SITE_URL no es una URL valida, se ignora: ${sitio}`)
    return base
  }
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
          // Origenes que pueden hacer el PUT firmado directo al bucket.
          //
          // `*.workers.dev` cubre los despliegues de vista previa de
          // Cloudflare Workers, igual que `*.vercel.app` cubria los de Vercel
          // antes de la migracion. El dominio definitivo se anade desde
          // NEXT_PUBLIC_SITE_URL para no tener que editar este archivo cada
          // vez que cambie: si no esta definida, se cae al par local+preview,
          // que es lo unico que se puede saber sin adivinar.
          AllowedOrigins: origenesPermitidos(),
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

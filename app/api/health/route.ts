import { NextResponse } from "next/server"
import { HeadBucketCommand } from "@aws-sdk/client-s3"
import { createServerSupabase } from "@/lib/supabase-server"
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2"
import { checkRateLimit, identificarSolicitante, respuesta429 } from "@/lib/rate-limit"
import { idDePeticion, logError } from "@/lib/log"

// Endpoint de salud (P-23). Responde si la app puede hablar con sus dos
// dependencias duras: Supabase (Postgres + Auth) y Cloudflare R2. Sin esto no
// hay forma automática de saber si "la app está viva pero no puede leer nada".
//
// LO QUE NO FILTRA, a propósito: ni el nombre del bucket, ni la URL de
// Supabase, ni ningún detalle interno. Un endpoint de salud es público por
// naturaleza (lo consulta el balanceador, el uptime monitor, el smoke), así
// que sólo dice "sano / degradado" por dependencia, nunca por qué. El detalle
// va al log estructurado, que sí es privado.
//
// Se corre en el runtime de Node (no edge) porque el SDK de S3 lo requiere.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Un chequeo colgado es peor que uno que falla: si Supabase o R2 no responden,
// el health debe decir "degradado" rápido, no quedarse esperando el timeout de
// la librería. 3 s es de sobra para un ping a cualquiera de los dos.
const TIMEOUT_MS = 3000

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}

async function comprobarSupabase(): Promise<boolean> {
  // Lectura trivial con la anon key: no trae datos sensibles (sólo un id) y
  // ejercita la conexión + RLS reales. [] sin error = sano (base vacía).
  const supabase = createServerSupabase()
  const { error } = await conTimeout(
    Promise.resolve(supabase.from("profiles").select("id").limit(1)),
    TIMEOUT_MS
  )
  return !error
}

async function comprobarR2(): Promise<boolean> {
  // HeadBucket es la operación más barata: no lista ni descarga nada, sólo
  // confirma que las credenciales sirven y el bucket existe.
  await conTimeout(r2Client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME })), TIMEOUT_MS)
  return true
}

export async function GET(request: Request) {
  const requestId = idDePeticion(request)

  // El health se puede consultar sin sesión, así que lleva su propio límite
  // por IP: 60/min alcanza para cualquier monitor honesto y corta el uso como
  // ariete de fuerza bruta contra las dependencias.
  const limite = checkRateLimit(`health:${identificarSolicitante(request)}`, 60, 60)
  if (!limite.permitido) return respuesta429(limite.reintentarEn)

  const [supabaseOk, r2Ok] = await Promise.all([
    comprobarSupabase().catch((error) => {
      logError("api/health", "Supabase no respondió al chequeo de salud", error, { requestId })
      return false
    }),
    comprobarR2().catch((error) => {
      logError("api/health", "R2 no respondió al chequeo de salud", error, { requestId })
      return false
    }),
  ])

  const sano = supabaseOk && r2Ok
  const cuerpo = {
    estado: sano ? "ok" : "degradado",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "desarrollo",
    dependencias: {
      supabase: supabaseOk ? "ok" : "error",
      r2: r2Ok ? "ok" : "error",
    },
  }

  return NextResponse.json(cuerpo, {
    // 503 cuando algo está caído: es lo que un balanceador o un uptime monitor
    // esperan para sacar la instancia de rotación o disparar una alerta.
    status: sano ? 200 : 503,
    headers: {
      // Nunca cachear la salud: cada consulta debe reflejar el estado de ahora.
      "Cache-Control": "no-store, max-age=0",
    },
  })
}

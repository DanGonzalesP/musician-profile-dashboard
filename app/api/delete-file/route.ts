import { NextResponse } from "next/server"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { createClient } from "@supabase/supabase-js"
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { getAuthenticatedUser } from "@/lib/server-auth"

// Borra de R2 archivos que quedaron huérfanos al publicar (ej. el usuario
// reemplazó una pista o una imagen por otra). Lo llama profile-editor.tsx
// justo después de un publish exitoso, con las URLs que ya nadie referencia.
const ALLOWED_FOLDERS = new Set(["images", "audio", "video"])

// Mismo cliente que usa el navegador (key anónima): profile_blocks, products
// y services tienen SELECT público (cualquier visitante puede leer un
// perfil), así que alcanza para el chequeo de "¿todavía lo usa alguien?" de
// abajo sin necesitar una service role key.
function publicSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(request: Request) {
  try {
    // Solo usuarios autenticados pueden pedir un borrado.
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para borrar archivos." }, { status: 401 })
    }

    const { urls } = await request.json()
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "Lista de URLs inválida" }, { status: 400 })
    }

    // Las keys de R2 son públicas (se ven en el HTML de cualquier perfil),
    // así que sin el chequeo de abajo un usuario autenticado cualquiera
    // podría borrar el archivo de otro con solo conocer su URL. Filtramos
    // primero a solo URLs que de verdad apuntan a nuestro bucket/carpetas
    // permitidas, antes de gastar la consulta a Supabase.
    const candidateUrls = (urls as unknown[])
      .filter((u): u is string => typeof u === "string" && u.startsWith(`${R2_PUBLIC_URL}/`))
      .filter((u) => ALLOWED_FOLDERS.has(u.slice(R2_PUBLIC_URL.length + 1).split("/")[0]))
      .slice(0, 100)

    if (candidateUrls.length === 0) {
      return NextResponse.json({ deleted: [], skipped: urls })
    }

    const supabase = publicSupabase()
    const [{ data: blocks }, { data: products }, { data: services }] = await Promise.all([
      supabase.from("profile_blocks").select("content"),
      supabase.from("products").select("*"),
      supabase.from("services").select("*"),
    ])
    // Un solo string gigante para chequear "¿alguna fila, de cualquier
    // perfil, todavía menciona esta URL?" — si sí, no se borra, sin importar
    // quién lo pidió: evita que se borre un archivo que otro perfil sigue
    // usando activamente.
    const haystack = JSON.stringify([blocks, products, services])

    const deleted: string[] = []
    const skipped: string[] = []

    for (const url of candidateUrls) {
      if (haystack.includes(url)) {
        skipped.push(url)
        continue
      }
      const key = url.slice(R2_PUBLIC_URL.length + 1)
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
        deleted.push(url)
      } catch (err) {
        console.error("[api/delete-file] Error borrando", key, err)
        skipped.push(url)
      }
    }

    return NextResponse.json({ deleted, skipped })
  } catch (error: any) {
    console.error("[api/delete-file]", error)
    return NextResponse.json({ error: error.message ?? "No se pudo borrar el archivo" }, { status: 500 })
  }
}

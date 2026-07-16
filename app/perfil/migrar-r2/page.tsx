"use client"

// Herramienta temporal de un solo uso: copia a Cloudflare R2 todas las
// imágenes/audios que hoy viven en Supabase Storage y que están referenciados
// en el perfil del usuario logueado (borrador, publicado, productos y música
// del feed), y reescribe esas filas para que apunten a R2 en vez de Supabase.
//
// Corre con la sesión real del usuario (mismo cliente `supabase` que el
// resto de la app) — así RLS aplica normal y cada quien solo puede migrar
// sus propios perfiles/bandas, sin necesitar la Service Role Key.
//
// No borra nada en Supabase. Una vez confirmado que todo se ve bien en el
// perfil publicado, borrar los archivos viejos a mano desde el Dashboard de
// Supabase (Storage > bucket "assets") — y después borrar esta carpeta
// (app/perfil/migrar-r2), ya cumplió su propósito.

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { fetchMyProfiles } from "@/lib/bands"

const SUPABASE_ASSET_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/`

function collectSupabaseUrls(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith(SUPABASE_ASSET_PREFIX)) found.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectSupabaseUrls(v, found))
    return
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collectSupabaseUrls(v, found))
  }
}

function replaceSupabaseUrls<T>(value: T, map: Map<string, string>): T {
  if (typeof value === "string") {
    return (map.get(value) ?? value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceSupabaseUrls(v, map)) as unknown as T
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceSupabaseUrls(v, map)
    }
    return out as T
  }
  return value
}

async function migrateOneFile(fileUrl: string): Promise<string> {
  const downloadRes = await fetch(fileUrl)
  if (!downloadRes.ok) throw new Error(`No se pudo descargar (${downloadRes.status})`)
  const blob = await downloadRes.blob()

  const pathPart = fileUrl.split("/assets/")[1] ?? ""
  const folder: "images" | "audio" = pathPart.startsWith("audio/") ? "audio" : "images"
  const ext = (pathPart.split(".").pop() ?? "bin").toLowerCase()
  const contentType = blob.type || (folder === "audio" ? "audio/mpeg" : "image/webp")

  const presignRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, extension: ext, contentType }),
  })
  if (!presignRes.ok) throw new Error("No se pudo generar la URL de subida a R2")
  const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string }

  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob })
  if (!putRes.ok) throw new Error("No se pudo subir el archivo a R2")

  return publicUrl
}

export default function MigrarR2Page() {
  const router = useRouter()
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg])
  }

  async function runMigration() {
    setRunning(true)
    setDone(false)
    setLog([])
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }

      const myProfiles = await fetchMyProfiles(user.id)
      if (myProfiles.length === 0) {
        addLog("No se encontró ningún perfil propio para este usuario.")
        return
      }
      addLog(`Perfiles a revisar: ${myProfiles.map((p) => p.displayName).join(", ")}`)

      const urlMap = new Map<string, string>()

      for (const profileOption of myProfiles) {
        const profileId = profileOption.id
        addLog(`\n--- Perfil: ${profileOption.displayName} ---`)

        const [{ data: profileRow }, { data: blockRows }, { data: productRows }, { data: feedRows }] =
          await Promise.all([
            supabase.from("profiles").select("draft_content").eq("id", profileId).maybeSingle(),
            supabase.from("profile_blocks").select("id, content").eq("profile_id", profileId),
            supabase.from("products").select("id, images_urls").eq("seller_id", profileId),
            supabase.from("music_feed").select("id, audio_url, cover_image_url").eq("profile_id", profileId),
          ])

        const found = new Set<string>()
        if (profileRow?.draft_content) collectSupabaseUrls(profileRow.draft_content, found)
        for (const row of blockRows ?? []) collectSupabaseUrls(row.content, found)
        for (const row of productRows ?? []) collectSupabaseUrls(row.images_urls, found)
        for (const row of feedRows ?? []) {
          if (row.audio_url) collectSupabaseUrls(row.audio_url, found)
          if (row.cover_image_url) collectSupabaseUrls(row.cover_image_url, found)
        }

        addLog(`Archivos de Supabase encontrados: ${found.size}`)

        for (const url of found) {
          if (urlMap.has(url)) continue
          try {
            addLog(`Subiendo a R2: ${decodeURIComponent(url.split("/assets/")[1] ?? url)}`)
            urlMap.set(url, await migrateOneFile(url))
          } catch (err) {
            addLog(`  ERROR subiendo ${url}: ${(err as Error).message}`)
          }
        }

        if (profileRow?.draft_content) {
          const updated = replaceSupabaseUrls(profileRow.draft_content, urlMap)
          if (JSON.stringify(updated) !== JSON.stringify(profileRow.draft_content)) {
            const { error } = await supabase.from("profiles").update({ draft_content: updated }).eq("id", profileId)
            addLog(error ? `  ERROR actualizando draft_content: ${error.message}` : "  draft_content actualizado.")
          }
        }

        let blocksUpdated = 0
        for (const row of blockRows ?? []) {
          const updated = replaceSupabaseUrls(row.content, urlMap)
          if (JSON.stringify(updated) === JSON.stringify(row.content)) continue
          const { error } = await supabase.from("profile_blocks").update({ content: updated }).eq("id", row.id)
          if (error) addLog(`  ERROR actualizando bloque ${row.id}: ${error.message}`)
          else blocksUpdated++
        }
        if (blocksUpdated > 0) addLog(`  profile_blocks actualizados: ${blocksUpdated}`)

        let productsUpdated = 0
        for (const row of productRows ?? []) {
          const updated = replaceSupabaseUrls(row.images_urls, urlMap)
          if (JSON.stringify(updated) === JSON.stringify(row.images_urls)) continue
          const { error } = await supabase.from("products").update({ images_urls: updated }).eq("id", row.id)
          if (error) addLog(`  ERROR actualizando producto ${row.id}: ${error.message}`)
          else productsUpdated++
        }
        if (productsUpdated > 0) addLog(`  products actualizados: ${productsUpdated}`)

        let feedUpdated = 0
        for (const row of feedRows ?? []) {
          const newAudio = row.audio_url ? urlMap.get(row.audio_url) : undefined
          const newCover = row.cover_image_url ? urlMap.get(row.cover_image_url) : undefined
          if (!newAudio && !newCover) continue
          const patch: Record<string, string> = {}
          if (newAudio) patch.audio_url = newAudio
          if (newCover) patch.cover_image_url = newCover
          const { error } = await supabase.from("music_feed").update(patch).eq("id", row.id)
          if (error) addLog(`  ERROR actualizando music_feed ${row.id}: ${error.message}`)
          else feedUpdated++
        }
        if (feedUpdated > 0) addLog(`  music_feed actualizados: ${feedUpdated}`)
      }

      addLog(`\n--- Listo ---`)
      addLog(`Total de archivos migrados a R2: ${urlMap.size}`)
      addLog(
        "Los archivos originales en Supabase NO se borraron. Revisá tu perfil publicado y, si todo se ve bien, " +
          "borralos manualmente desde el Dashboard de Supabase (Storage > bucket \"assets\")."
      )
      setDone(true)
    } catch (err) {
      addLog(`ERROR general: ${(err as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 32, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Migrar archivos de Supabase a R2</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
        Herramienta temporal de un solo uso. Copia a Cloudflare R2 todo lo que hoy está en Supabase Storage y
        referenciado en tu perfil (borrador, publicado, productos y música del feed) — incluye tus bandas si sos
        dueño o miembro de alguna. Actualiza esas filas para que apunten a R2. No borra nada de Supabase.
      </p>
      <button
        onClick={runMigration}
        disabled={running}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          background: "#111",
          color: "#fff",
          fontSize: 13,
          cursor: running ? "default" : "pointer",
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? "Migrando..." : done ? "Volver a correr" : "Empezar migración"}
      </button>
      <pre
        style={{
          marginTop: 16,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          background: "#f5f5f5",
          color: "#111",
          padding: 12,
          borderRadius: 8,
          maxHeight: 420,
          overflowY: "auto",
        }}
      >
        {log.join("\n") || "Sin actividad todavía."}
      </pre>
      <p style={{ marginTop: 16, fontSize: 12 }}>
        <Link href="/perfil/dashboard">Volver al panel</Link>
      </p>
    </div>
  )
}

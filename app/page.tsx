"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Music, Loader2 } from "lucide-react"
import { type FeedTrack, fetchAllPublicFeed } from "@/lib/musicFeed"
import MusicFeedPlayer from "@/components/music-feed-player"

export default function Page() {
  const [tracks, setTracks] = useState<FeedTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMensaje, setErrorMensaje] = useState("")

  useEffect(() => {
    async function cargarFeed() {
      try {
        const data = await fetchAllPublicFeed()
        setTracks(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cargar el feed."
        setErrorMensaje(message)
      } finally {
        setLoading(false)
      }
    }
    cargarFeed()
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Barra de Navegación Superior */}
      <header className="border-b border-border bg-card/50 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
            D
          </div>
          <span className="font-bold text-lg tracking-tight">Décima</span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-xs font-medium px-4 py-2 rounded-lg hover:bg-accent transition-colors">
            Iniciar Sesión
          </Link>
          <Link href="/login?modo=registro" className="text-xs font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-md">
            Registrarse
          </Link>
        </div>
      </header>

      {/* Feed público de música */}
      <main className="flex-1 px-4 py-10 max-w-2xl w-full mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4 border border-primary/20">
            <Music className="size-3.5" /> Feed de Música
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Descubre música de artistas independientes
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Últimas canciones publicadas por artistas en Décima.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : errorMensaje ? (
          <p className="text-center text-sm text-destructive">{errorMensaje}</p>
        ) : (
          <MusicFeedPlayer tracks={tracks} />
        )}
      </main>
    </div>
  )
}
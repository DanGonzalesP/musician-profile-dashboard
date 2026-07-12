"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Pause, Volume2, SkipForward, SkipBack } from "lucide-react"

interface Track {
  id: string
  title: string
  audio_file_url: string
  duration_seconds: number
}

interface MusicPlayerProps {
  tracks: Track[]
}

export function MusicPlayer({ tracks }: MusicPlayerProps) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const currentTrack = tracks[currentTrackIndex]

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = currentTrack?.audio_file_url || ""
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false))
      }
    }
  }, [currentTrackIndex])

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleNext = () => {
    if (currentTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex((prev) => prev + 1)
    } else {
      setCurrentTrackIndex(0) // Bucle al inicio
    }
  }

  const handlePrev = () => {
    if (currentTrackIndex > 0) {
      setCurrentTrackIndex((prev) => prev - 1)
    }
  }

  if (!currentTrack) {
    return <p className="text-xs text-muted-foreground">No hay canciones disponibles.</p>
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleNext}
      />
      
      {/* Info de la canción actual */}
      <div className="mb-3">
        <h3 className="text-sm font-medium leading-none">{currentTrack.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">Reproduciendo ahora</p>
      </div>

      {/* Barra de Progreso */}
      <div className="mb-4">
        <input
          type="range"
          min="0"
          max={audioRef.current?.duration || currentTrack.duration_seconds || 100}
          value={currentTime}
          onChange={(e) => {
            if (audioRef.current) {
              audioRef.current.currentTime = Number(e.target.value)
              setCurrentTime(audioRef.current.currentTime)
            }
          }}
          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
        />
      </div>

      {/* Controles de reproducción */}
      <div className="flex items-center justify-between">
        <button onClick={handlePrev} className="rounded-md p-2 hover:bg-muted">
          <SkipBack className="size-4" />
        </button>
        
        <button onClick={togglePlay} className="rounded-full bg-primary p-3 text-primary-foreground hover:scale-105 transition-transform">
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>

        <button onClick={handleNext} className="rounded-md p-2 hover:bg-muted">
          <SkipForward className="size-4" />
        </button>
      </div>
    </div>
  )
}
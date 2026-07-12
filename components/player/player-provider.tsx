"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Track } from "@/lib/artist-data"

type PlayerContextValue = {
  queue: Track[]
  current: Track | null
  isPlaying: boolean
  progress: number // seconds
  volume: number // 0..1
  muted: boolean
  playTrack: (track: Track, queue?: Track[]) => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([])
  const [current, setCurrent] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolumeState] = useState(0.8)
  const [muted, setMuted] = useState(false)

  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)

  const currentIndex = current
    ? queue.findIndex((t) => t.id === current.id)
    : -1

  const next = useCallback(() => {
    if (queue.length === 0 || currentIndex === -1) return
    const nextIndex = (currentIndex + 1) % queue.length
    setCurrent(queue[nextIndex])
    setProgress(0)
    setIsPlaying(true)
  }, [queue, currentIndex])

  const previous = useCallback(() => {
    if (queue.length === 0 || currentIndex === -1) return
    // Restart track if past 3s, otherwise go to previous
    if (progress > 3) {
      setProgress(0)
      return
    }
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length
    setCurrent(queue[prevIndex])
    setProgress(0)
    setIsPlaying(true)
  }, [queue, currentIndex, progress])

  // Simulated playback clock
  useEffect(() => {
    if (!isPlaying || !current) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTickRef.current = null
      return
    }

    const tick = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now
      const delta = (now - lastTickRef.current) / 1000
      lastTickRef.current = now

      setProgress((prev) => {
        const nextValue = prev + delta
        if (nextValue >= current.duration) {
          // advance to next track on the next frame
          queueMicrotask(next)
          return current.duration
        }
        return nextValue
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTickRef.current = null
    }
  }, [isPlaying, current, next])

  const playTrack = useCallback(
    (track: Track, nextQueue?: Track[]) => {
      if (nextQueue) setQueue(nextQueue)
      else if (queue.length === 0) setQueue([track])

      if (current?.id === track.id) {
        setIsPlaying((p) => !p)
      } else {
        setCurrent(track)
        setProgress(0)
        setIsPlaying(true)
      }
    },
    [current, queue.length],
  )

  const togglePlay = useCallback(() => {
    if (!current) return
    setIsPlaying((p) => !p)
  }, [current])

  const seek = useCallback(
    (seconds: number) => {
      if (!current) return
      setProgress(Math.max(0, Math.min(seconds, current.duration)))
    },
    [current],
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0, Math.min(1, v)))
    setMuted(v === 0)
  }, [])

  const toggleMute = useCallback(() => setMuted((m) => !m), [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      current,
      isPlaying,
      progress,
      volume,
      muted,
      playTrack,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
    }),
    [
      queue,
      current,
      isPlaying,
      progress,
      volume,
      muted,
      playTrack,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider")
  return ctx
}

export function formatTime(seconds: number) {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, "0")}`
}

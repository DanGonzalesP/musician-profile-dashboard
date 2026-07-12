"use client"

import Image from "next/image"
import { useCallback, useRef } from "react"
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime, usePlayer } from "./player-provider"

function ProgressBar({
  value,
  max,
  onSeek,
  className,
  ariaLabel,
}: {
  value: number
  max: number
  onSeek: (v: number) => void
  className?: string
  ariaLabel: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onSeek(ratio * max)
    },
    [max, onSeek],
  )

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromClientX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) seekFromClientX(e.clientX)
      }}
      onPointerUp={(e) => {
        draggingRef.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(max, value + 5))
        if (e.key === "ArrowLeft") onSeek(Math.max(0, value - 5))
      }}
      className={cn(
        "group/seek relative flex h-4 cursor-pointer items-center",
        className,
      )}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
        style={{ left: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  )
}

export function PlayBar() {
  const {
    current,
    isPlaying,
    progress,
    volume,
    muted,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
  } = usePlayer()

  if (!current) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:px-6">
        {/* Mobile seek bar on top */}
        <div className="flex items-center gap-2 sm:hidden">
          <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
            {formatTime(progress)}
          </span>
          <ProgressBar
            value={progress}
            max={current.duration}
            onSeek={seek}
            ariaLabel="Seek track"
            className="flex-1"
          />
          <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
            {formatTime(current.duration)}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Now playing */}
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-64 sm:flex-none">
            <Image
              src={current.artwork || "/placeholder.svg"}
              alt=""
              width={48}
              height={48}
              className="size-11 shrink-0 rounded-md object-cover sm:size-12"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {current.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Elena Vance
              </p>
            </div>
          </div>

          {/* Center controls + desktop seek */}
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={previous}
                aria-label="Previous track"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <SkipBack className="size-5" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5 translate-x-px" />
                )}
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next track"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <SkipForward className="size-5" />
              </button>
            </div>

            <div className="hidden w-full max-w-md items-center gap-2 sm:flex">
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatTime(progress)}
              </span>
              <ProgressBar
                value={progress}
                max={current.duration}
                onSeek={seek}
                ariaLabel="Seek track"
                className="flex-1"
              />
              <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
                {formatTime(current.duration)}
              </span>
            </div>
          </div>

          {/* Volume (desktop) */}
          <div className="hidden w-40 items-center justify-end gap-2 sm:flex">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-5" />
              ) : (
                <Volume2 className="size-5" />
              )}
            </button>
            <ProgressBar
              value={muted ? 0 : volume}
              max={1}
              onSeek={setVolume}
              ariaLabel="Volume"
              className="w-24"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

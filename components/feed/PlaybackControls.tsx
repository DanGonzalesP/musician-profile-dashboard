// components/feed/PlaybackControls.tsx
"use client";

import { Heart, Pause, Play } from "lucide-react";
import { useLocale } from "@/components/locale-provider";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  isLiked,
  onTogglePlay,
  onSeek,
  onToggleLike,
}: PlaybackControlsProps) {
  const { t } = useLocale();

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          aria-label={t("feed_seek_aria")}
        />
        <span className="w-9 text-xs tabular-nums text-muted-foreground">{formatTime(duration)}</span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={onToggleLike}
          aria-label={isLiked ? t("feed_like_aria_remove") : t("feed_like_aria_add")}
          className="text-muted-foreground transition-colors hover:text-primary"
        >
          <Heart className={`h-6 w-6 ${isLiked ? "fill-primary text-primary" : ""}`} />
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? t("feed_pause_aria") : t("feed_play_aria")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-6 w-6 fill-primary-foreground" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-primary-foreground" />
          )}
        </button>

        <div className="h-6 w-6" aria-hidden />
      </div>
    </div>
  );
}

// components/feed/PlaybackControls.tsx
"use client";

import { useState } from "react";
import { Check, Heart, MessageCircle, Pause, Play, Share2 } from "lucide-react";
import { useLocale } from "@/components/locale-provider";

// Like, comentarios y compartir viven a los costados del botón de reproducir
// (debajo del disco) — el corazón y comentarios a un lado, compartir al otro,
// en vez de un rail flotante aparte.
interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  isLiked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  commentCount?: number;
  onOpenComments?: () => void;
  shareUrl: string;
  shareTitle: string;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function SideButton({
  label,
  count,
  onClick,
  active = false,
  children,
}: {
  label: string;
  count?: number;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`flex size-11 items-center justify-center rounded-2xl border backdrop-blur-xl transition-all duration-200 active:scale-90 ${
          active
            ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--primary)]"
            : "border-border/60 bg-card/50 text-foreground/90 hover:border-primary/40 hover:text-foreground"
        }`}
      >
        {children}
      </button>
      {typeof count === "number" && (
        <span className="text-[11px] font-bold tabular-nums text-foreground/80">{formatCount(count)}</span>
      )}
    </div>
  );
}

export default function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  isLiked,
  likeCount,
  onToggleLike,
  commentCount,
  onOpenComments,
  shareUrl,
  shareTitle,
}: PlaybackControlsProps) {
  const { t } = useLocale();
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const url = shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url });
        return;
      }
    } catch {
      // El usuario canceló el diálogo nativo — no es un error.
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* portapapeles no disponible */
    }
  };

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

      <div className="mt-4 flex items-center justify-center gap-5">
        <SideButton label={t("feed_share_aria")} onClick={handleShare} active={shared}>
          {shared ? <Check className="size-5 text-primary" /> : <Share2 className="size-5" />}
        </SideButton>

        <SideButton
          label={isLiked ? t("feed_like_aria_remove") : t("feed_like_aria_add")}
          count={likeCount}
          onClick={onToggleLike}
          active={isLiked}
        >
          <Heart className={`size-5 ${isLiked ? "fill-primary text-primary" : ""}`} />
        </SideButton>

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? t("feed_pause_aria") : t("feed_play_aria")}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-6 w-6 fill-primary-foreground" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-primary-foreground" />
          )}
        </button>

        {onOpenComments && (
          <SideButton label={t("feed_comments_open_aria")} count={commentCount ?? 0} onClick={onOpenComments}>
            <MessageCircle className="size-5" />
          </SideButton>
        )}
      </div>
    </div>
  );
}

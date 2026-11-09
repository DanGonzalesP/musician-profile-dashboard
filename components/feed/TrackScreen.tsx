// components/feed/TrackScreen.tsx
"use client";

import { forwardRef } from "react";
import { Users } from "lucide-react";
import type { FeedTrack } from "@/lib/musicFeed";
import { MUSICIAN_ROLES } from "@/lib/musician-roles";
import { useLocale } from "@/components/locale-provider";
import VinylCover from "./VinylCover";
import PlaybackControls from "./PlaybackControls";
import MarqueeText from "./MarqueeText";
import AuthorProfileLink from "./AuthorProfileLink";
import { AudioPlaybackError } from "@/components/audio-playback-error";

interface TrackScreenProps {
  track: FeedTrack;
  isActive: boolean;
  isPlaying: boolean;
  playbackFailed?: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
}

const TrackScreen = forwardRef<HTMLDivElement, TrackScreenProps>(function TrackScreen(
  {
    track,
    isActive,
    isPlaying,
    playbackFailed,
    currentTime,
    duration,
    isLiked,
    onTogglePlay,
    onSeek,
    onToggleLike,
    onOpenComments,
  },
  ref
) {
  const { t } = useLocale();

  const roleLabels = track.roles
    .map((id) => MUSICIAN_ROLES.find((r) => r.id === id)?.label)
    .filter(Boolean) as string[];

  return (
    <section
      ref={ref}
      // items-center-safe: si el contenido no cabe (pantalla baja, aviso de
      // error), se desborda hacia abajo y nunca tapa la navegación ni los filtros.
      className="relative flex h-dvh w-full snap-start snap-always items-center-safe justify-center overflow-hidden px-6 pb-28 pt-48 lg:pt-24"
    >
      {track.coverImageUrl && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${track.coverImageUrl})` }}
        />
      )}

      <div className="flex max-h-full w-full max-w-sm flex-col items-center gap-6 overflow-y-auto overscroll-contain [@media(max-height:720px)]:gap-3 sm:max-w-md">
        <VinylCover coverImageUrl={track.coverImageUrl} isActive={isActive} isPlaying={isPlaying} onTap={onTogglePlay} />

        <div className="w-full text-center">
          <MarqueeText text={track.title} className="text-xl font-bold text-foreground sm:text-2xl" />
          <AuthorProfileLink name={track.artistName} username={track.username} className="text-sm font-medium text-primary sm:text-base" />
          {(roleLabels.length > 0 || track.isGroup) && (
            <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
              {roleLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur"
                >
                  {label}
                </span>
              ))}
              {track.isGroup && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Users className="size-2.5" /> {t("profile_band_badge")}
                </span>
              )}
            </p>
          )}
        </div>

        {isActive && playbackFailed && <AudioPlaybackError onRetry={onTogglePlay} />}
        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
          isLiked={isLiked}
          onToggleLike={onToggleLike}
          onOpenComments={onOpenComments}
        />
      </div>
    </section>
  );
});

export default TrackScreen;

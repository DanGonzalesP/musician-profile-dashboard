// components/feed/TrackScreen.tsx
"use client";

import { forwardRef } from "react";
import type { FeedTrack } from "@/lib/musicFeed";
import { useLocale } from "@/components/locale-provider";
import VinylCover from "./VinylCover";
import PlaybackControls from "./PlaybackControls";
import MarqueeText from "./MarqueeText";

interface TrackScreenProps {
  track: FeedTrack;
  isSample: boolean;
  isActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
}

const TrackScreen = forwardRef<HTMLDivElement, TrackScreenProps>(function TrackScreen(
  { track, isSample, isActive, isPlaying, currentTime, duration, isLiked, onTogglePlay, onSeek, onToggleLike },
  ref
) {
  const { t } = useLocale();

  return (
    <section
      ref={ref}
      className="relative flex h-dvh w-full snap-start snap-always items-center justify-center overflow-hidden px-6 pb-28 pt-24"
    >
      {track.coverImageUrl && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${track.coverImageUrl})` }}
        />
      )}

      <div className="flex w-full max-w-sm flex-col items-center gap-6 sm:max-w-md">
        {isSample && (
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            {t("feed_sample_badge")}
          </span>
        )}

        <VinylCover coverImageUrl={track.coverImageUrl} isActive={isActive} isPlaying={isPlaying} onTap={onTogglePlay} />

        <div className="w-full text-center">
          <MarqueeText text={track.title} className="text-xl font-bold text-foreground sm:text-2xl" />
          <MarqueeText text={track.artistName} className="mt-1 text-sm font-medium text-primary sm:text-base" />
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          isLiked={isLiked}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
          onToggleLike={onToggleLike}
        />
      </div>
    </section>
  );
});

export default TrackScreen;

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
import ActionRail from "./ActionRail";

interface TrackScreenProps {
  track: FeedTrack;
  isSample: boolean;
  isActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  commentCount: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
}

const TrackScreen = forwardRef<HTMLDivElement, TrackScreenProps>(function TrackScreen(
  {
    track,
    isSample,
    isActive,
    isPlaying,
    currentTime,
    duration,
    isLiked,
    commentCount,
    onTogglePlay,
    onSeek,
    onToggleLike,
    onOpenComments,
  },
  ref
) {
  const { t } = useLocale();

  const artistSlug = track.artistName.trim().toLowerCase().replace(/\s+/g, "-");
  const roleLabels = track.roles
    .map((id) => MUSICIAN_ROLES.find((r) => r.id === id)?.label)
    .filter(Boolean) as string[];

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
        <VinylCover coverImageUrl={track.coverImageUrl} isActive={isActive} isPlaying={isPlaying} onTap={onTogglePlay} />

        <div className="w-full text-center">
          <MarqueeText text={track.title} className="text-xl font-bold text-foreground sm:text-2xl" />
          <span className="mt-1 flex items-center justify-center gap-2">
            <MarqueeText text={track.artistName} className="text-sm font-medium text-primary sm:text-base" />
            {track.isGroup && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Users className="size-2.5" /> {t("profile_band_badge")}
              </span>
            )}
          </span>
          {roleLabels.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
              {roleLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur"
                >
                  {label}
                </span>
              ))}
            </p>
          )}
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
        />
      </div>

      {/* Rail de acciones estilo TikTok — como el panel de comentarios se
          despliega a la derecha, el rail vive en ese mismo borde. */}
      <div className="absolute bottom-32 right-4 z-20 sm:right-6">
        <ActionRail
          isLiked={isLiked}
          likeCount={isLiked ? 1 : 0}
          commentCount={commentCount}
          onToggleLike={onToggleLike}
          onOpenComments={onOpenComments}
          shareUrl={isSample ? "/" : `/${artistSlug}`}
          shareTitle={`${track.title} — ${track.artistName}`}
        />
      </div>
    </section>
  );
});

export default TrackScreen;

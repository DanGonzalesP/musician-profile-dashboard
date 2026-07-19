// components/feed/FeedContainer.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed/publicPosts";
import type { FeedTrack } from "@/lib/musicFeed";
import { fetchCommentCounts } from "@/lib/track-comments";
import TrackScreen from "./TrackScreen";
import PostScreen from "./PostScreen";
import CommentsPanel from "./CommentsPanel";

interface FeedContainerProps {
  items: FeedItem[];
  isSampleFeed: boolean;
}

export default function FeedContainer({ items, isSampleFeed }: FeedContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // Pista cuyo panel de comentarios está abierto (null = cerrado).
  const [commentsTrack, setCommentsTrack] = useState<FeedTrack | null>(null);

  const activeItem = items[activeIndex];
  const activeTrack = activeItem?.kind === "track" ? activeItem.track : null;

  // Conteos de comentarios de todas las pistas visibles, en una sola consulta.
  useEffect(() => {
    if (isSampleFeed) return;
    const trackIds = items.filter((i) => i.kind === "track").map((i) => (i as { track: FeedTrack }).track.id);
    fetchCommentCounts(trackIds).then(setCommentCounts);
  }, [items, isSampleFeed]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = sectionRefs.current.findIndex((el) => el === entry.target);
            if (index !== -1) setActiveIndex(index);
          }
        });
      },
      { root, threshold: [0.6] }
    );
    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Una publicación no tiene audio propio: se silencia el reproductor y el
    // video (si lo hay) se maneja dentro de PostScreen.
    if (!activeTrack) {
      audio.pause();
      audio.removeAttribute("src");
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    audio.src = activeTrack.audioUrl;
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    audio
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeTrack?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const next = sectionRefs.current[activeIndex + 1];
      if (next) {
        next.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setIsPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [activeIndex]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const toggleLike = useCallback((id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const registerSection = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      sectionRefs.current[index] = el;
    },
    []
  );

  const handleCountChange = useCallback((trackId: string, count: number) => {
    setCommentCounts((prev) => ({ ...prev, [trackId]: count }));
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-dvh w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain scroll-smooth"
    >
      <audio ref={audioRef} preload="auto" />
      {items.map((item, index) =>
        item.kind === "track" ? (
          <TrackScreen
            key={item.id}
            ref={registerSection(index)}
            track={item.track}
            isSample={isSampleFeed}
            isActive={index === activeIndex}
            isPlaying={index === activeIndex && isPlaying}
            currentTime={index === activeIndex ? currentTime : 0}
            duration={index === activeIndex ? duration : item.track.durationSeconds ?? 0}
            isLiked={likedIds.has(item.id)}
            commentCount={commentCounts[item.track.id] ?? 0}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onToggleLike={() => toggleLike(item.id)}
            onOpenComments={() => setCommentsTrack(item.track)}
          />
        ) : (
          <PostScreen
            key={item.id}
            ref={registerSection(index)}
            post={item.post}
            isActive={index === activeIndex}
            isLiked={likedIds.has(item.id)}
            onToggleLike={() => toggleLike(item.id)}
          />
        )
      )}

      <CommentsPanel
        trackId={commentsTrack?.id ?? null}
        trackTitle={commentsTrack ? `${commentsTrack.title} — ${commentsTrack.artistName}` : ""}
        isSample={isSampleFeed}
        onClose={() => setCommentsTrack(null)}
        onCountChange={handleCountChange}
      />
    </div>
  );
}

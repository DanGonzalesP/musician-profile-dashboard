// components/feed/FeedContainer.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed/publicPosts";
import type { FeedTrack } from "@/lib/musicFeed";
import * as audioEngine from "@/lib/audio-engine";
import { fetchCommentCounts } from "@/lib/track-comments";
import { fetchPostCommentCounts } from "@/lib/post-comments";
import TrackScreen from "./TrackScreen";
import PostScreen from "./PostScreen";
import CommentsPanel, { type CommentTarget } from "./CommentsPanel";
import FeedScrollNav from "./FeedScrollNav";
import FeedShareButton from "./FeedShareButton";

interface FeedContainerProps {
  items: FeedItem[];
  isSampleFeed: boolean;
}

export default function FeedContainer({ items, isSampleFeed }: FeedContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  // Reproducción centralizada en el motor global (lib/audio-engine): un único
  // <audio> para toda la app, sin colisiones con la discografía del perfil.
  const [engine, setEngine] = useState<audioEngine.AudioEngineState>(audioEngine.getState);
  useEffect(() => audioEngine.subscribe(setEngine), []);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // En escritorio el panel de comentarios está siempre abierto y sigue a la
  // pista activa; en móvil este estado controla la hoja inferior.
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);

  const activeItem = items[activeIndex];
  const activeTrack = activeItem?.kind === "track" ? activeItem.track : null;

  // Elemento comentable activo (canción o publicación) — el panel de
  // comentarios sigue a cualquiera de los dos, no solo a canciones.
  const activeCommentsTarget: CommentTarget | null =
    activeItem?.kind === "track"
      ? { kind: "track", id: activeItem.track.id, title: `${activeItem.track.title} — ${activeItem.track.artistName}` }
      : activeItem?.kind === "post"
        ? { kind: "post", id: activeItem.post.id, title: activeItem.post.caption || activeItem.post.authorName }
        : null;

  // Conteos de comentarios de todas las pistas y publicaciones visibles, en
  // una sola consulta por tipo.
  useEffect(() => {
    if (isSampleFeed) return;
    const trackIds = items.filter((i) => i.kind === "track").map((i) => (i as { track: FeedTrack }).track.id);
    const postIds = items.filter((i) => i.kind === "post").map((i) => (i as Extract<FeedItem, { kind: "post" }>).post.id);
    fetchCommentCounts(trackIds).then((counts) => setCommentCounts((prev) => ({ ...prev, ...counts })));
    fetchPostCommentCounts(postIds).then((counts) => setCommentCounts((prev) => ({ ...prev, ...counts })));
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

  // Al cambiar la pista activa (por scroll), el motor la reproduce desde 0 y,
  // al terminar, avanza al siguiente ítem del feed. Una publicación no tiene
  // audio propio: se pausa el motor (el video, si lo hay, lo maneja PostScreen).
  useEffect(() => {
    if (!activeTrack) {
      audioEngine.pause();
      return;
    }
    audioEngine.play(activeTrack.audioUrl, {
      onEnded: () => {
        const next = sectionRefs.current[activeIndex + 1];
        if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeTrack?.audioUrl]);

  // Al desmontar el feed (cambio de ruta), se detiene la reproducción para no
  // dejar audio huérfano sonando sin controles.
  useEffect(() => () => audioEngine.stop(), []);

  const isPlaying = activeTrack != null && engine.url === activeTrack.audioUrl && engine.playing;
  const isActiveLoaded = activeTrack != null && engine.url === activeTrack.audioUrl;
  const currentTime = isActiveLoaded ? engine.currentTime : 0;
  const duration = isActiveLoaded ? engine.duration : 0;

  const togglePlay = useCallback(() => {
    if (activeTrack) audioEngine.toggle(activeTrack.audioUrl);
  }, [activeTrack]);

  const seek = useCallback(
    (time: number) => {
      if (activeTrack && audioEngine.isCurrent(activeTrack.audioUrl)) audioEngine.seek(time);
    },
    [activeTrack]
  );

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

  const scrollToIndex = useCallback((index: number) => {
    sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Info de compartir del ítem activo — el botón de compartir vive una sola
  // vez, debajo de la cápsula de subir/bajar, en vez de repetirse dentro de
  // cada tarjeta del feed.
  const activeShare = activeItem
    ? activeItem.kind === "track"
      ? {
          url: isSampleFeed ? "/" : `/${activeItem.track.artistName.trim().toLowerCase().replace(/\s+/g, "-")}`,
          title: `${activeItem.track.title} — ${activeItem.track.artistName}`,
        }
      : {
          url: `/${activeItem.post.authorName.trim().toLowerCase().replace(/\s+/g, "-")}`,
          title: activeItem.post.caption || activeItem.post.authorName,
        }
    : null;

  return (
    <div className="flex h-dvh w-full">
      <div className="relative h-dvh min-w-0 flex-1">
        <div
          ref={containerRef}
          className="h-dvh w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain scroll-smooth scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, index) =>
            item.kind === "track" ? (
              <TrackScreen
                key={item.id}
                ref={registerSection(index)}
                track={item.track}
                isActive={index === activeIndex}
                isPlaying={index === activeIndex && isPlaying}
                currentTime={index === activeIndex ? currentTime : 0}
                duration={index === activeIndex ? duration : item.track.durationSeconds ?? 0}
                isLiked={likedIds.has(item.id)}
                onTogglePlay={togglePlay}
                onSeek={seek}
                onToggleLike={() => toggleLike(item.id)}
                onOpenComments={() => setMobileCommentsOpen(true)}
              />
            ) : (
              <PostScreen
                key={item.id}
                ref={registerSection(index)}
                post={item.post}
                isActive={index === activeIndex}
                isLiked={likedIds.has(item.id)}
                onToggleLike={() => toggleLike(item.id)}
                onOpenComments={() => setMobileCommentsOpen(true)}
              />
            )
          )}
        </div>

        <div className="pointer-events-none absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-3 sm:right-6">
          <FeedScrollNav
            canGoPrev={activeIndex > 0}
            canGoNext={activeIndex < items.length - 1}
            onPrev={() => scrollToIndex(activeIndex - 1)}
            onNext={() => scrollToIndex(activeIndex + 1)}
          />
          {activeShare && <FeedShareButton shareUrl={activeShare.url} shareTitle={activeShare.title} />}
        </div>
      </div>

      <CommentsPanel
        target={activeCommentsTarget}
        isSample={isSampleFeed}
        mobileOpen={mobileCommentsOpen}
        onCloseMobile={() => setMobileCommentsOpen(false)}
        onCountChange={handleCountChange}
      />
    </div>
  );
}

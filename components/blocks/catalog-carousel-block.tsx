"use client";

import { useEffect, useRef, useState } from "react";
import { Library, Pause, Play } from "lucide-react";
import type { Album, CatalogData } from "@/lib/blocks";
import { useLocale } from "@/components/locale-provider";
import { setActiveAudio } from "@/lib/audio-bus";
import { claimNowPlaying, releaseNowPlaying } from "@/lib/now-playing";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trackKey(albumId: string, index: number) {
  return `${albumId}:${index}`;
}

export function CatalogCarouselBlock({ data }: { data: CatalogData }) {
  const { t } = useLocale();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);

  const stopAndClear = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
    }
    audioRef.current = null;
    loadedKeyRef.current = null;
    setIsPlaying(false);
    setPlayingKey(null);
    setCurrentTime(0);
    setDuration(0);
    releaseNowPlaying("catalog-carousel");
    setActiveAudio(null);
  };

  const loadAndPlay = (key: string, url: string, skipCors = false) => {
    const audio = new Audio();
    audioRef.current = audio;
    loadedKeyRef.current = key;

    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(audio.duration || 0);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    audio.onerror = () => {
      if (!skipCors) {
        loadAndPlay(key, url, true);
      } else {
        stopAndClear();
      }
    };

    if (!skipCors) {
      audio.crossOrigin = "anonymous";
      setActiveAudio(audio);
    }

    audio.src = url;
    audio
      .play()
      .then(() => {
        claimNowPlaying("catalog-carousel", () => {
          audio.pause();
          setIsPlaying(false);
        });
        setPlayingKey(key);
        setIsPlaying(true);
      })
      .catch(() => {
        if (!skipCors) {
          loadAndPlay(key, url, true);
        } else {
          stopAndClear();
        }
      });
  };

  const togglePlay = (key: string, url?: string) => {
    if (!url) return;
    const audio = audioRef.current;

    if (audio && loadedKeyRef.current === key) {
      if (audio.paused) {
        audio
          .play()
          .then(() => {
            claimNowPlaying("catalog-carousel", () => {
              audio.pause();
              setIsPlaying(false);
            });
            setPlayingKey(key);
            setIsPlaying(true);
          })
          .catch(() => stopAndClear());
      } else {
        audio.pause();
        setIsPlaying(false);
        releaseNowPlaying("catalog-carousel");
      }
      return;
    }

    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
    }
    setCurrentTime(0);
    setDuration(0);
    loadAndPlay(key, url);
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  useEffect(() => {
    return () => {
      stopAndClear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleItemClick = (album: Album) => {
    if (album.releaseType === "single") {
      const track = album.tracks[0];
      togglePlay(trackKey(album.id, 0), track?.audioUrl);
      return;
    }

    if (openAlbumId === album.id) {
      setOpenAlbumId(null);
      if (playingKey && playingKey.startsWith(`${album.id}:`)) {
        stopAndClear();
      }
      return;
    }

    setOpenAlbumId(album.id);
  };

  if (data.albums.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {t("catalog_empty")}
      </div>
    );
  }

  const openAlbum = data.albums.find((album) => album.id === openAlbumId) || null;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Library className="size-3.5" />
        {t("catalog_eyebrow")}
      </span>

      <div
        className="mt-4 flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {data.albums.map((album) => {
          const isSingle = album.releaseType === "single";
          const singleKey = trackKey(album.id, 0);
          const isSinglePlaying = isSingle && playingKey === singleKey && isPlaying;
          const isPanelOpen = !isSingle && openAlbumId === album.id;

          return (
            <button
              key={album.id}
              type="button"
              onClick={() => handleItemClick(album)}
              aria-label={
                isSingle
                  ? isSinglePlaying
                    ? t("catalog_pause_aria")
                    : t("catalog_play_aria")
                  : t("catalog_open_aria")
              }
              className="w-40 shrink-0 text-left"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-xl transition-shadow duration-300 hover:shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_45%,transparent)]">
                <img src={album.cover} alt={t("album_cover_alt")} className="h-full w-full object-cover" />

                {isSingle && (
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-background/40 transition-opacity ${
                      isSinglePlaying ? "opacity-100" : "opacity-0 hover:opacity-100"
                    }`}
                  >
                    {isSinglePlaying ? (
                      <Pause className="size-8 fill-foreground text-foreground" />
                    ) : (
                      <Play className="ml-0.5 size-8 fill-foreground text-foreground" />
                    )}
                  </span>
                )}

                {isPanelOpen && (
                  <span className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary" />
                )}
              </div>

              <div className="mt-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {album.title || t("catalog_untitled")}
                </p>
                {(album.genre || album.year) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[album.genre, album.year].filter(Boolean).join(" • ")}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {openAlbum && (
        <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {openAlbum.title || t("catalog_untitled")}
            </h4>
            <span className="text-xs text-muted-foreground">
              {openAlbum.tracks.length} {t(openAlbum.tracks.length === 1 ? "song_one" : "song_other")}
            </span>
          </div>

          <ul className="mt-3 flex flex-col gap-1">
            {openAlbum.tracks.map((track, index) => {
              const key = trackKey(openAlbum.id, index);
              const isActive = playingKey === key;
              const hasAudio = Boolean(track.audioUrl);

              return (
                <li key={key} className="flex flex-col gap-2 rounded-md px-1 py-1.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => togglePlay(key, track.audioUrl)}
                      disabled={!hasAudio}
                      aria-label={isActive && isPlaying ? t("catalog_pause_aria") : t("catalog_play_aria")}
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity ${
                        hasAudio
                          ? "bg-primary text-primary-foreground hover:opacity-90"
                          : "cursor-not-allowed border border-input opacity-60"
                      }`}
                    >
                      {isActive && isPlaying ? (
                        <Pause className="size-3.5 fill-current" />
                      ) : (
                        <Play className="ml-0.5 size-3.5 fill-current" />
                      )}
                    </button>

                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {track.title || t("track_untitled")}
                    </span>

                    <span className="shrink-0 text-xs text-muted-foreground">
                      {hasAudio ? track.duration : t("track_no_audio")}
                    </span>
                  </div>

                  {isActive && (
                    <div className="flex items-center gap-2 pl-11">
                      <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatTime(currentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        disabled={!duration}
                        onChange={(e) => seek(Number(e.target.value))}
                        aria-label={t("track_seek_aria")}
                        className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary disabled:cursor-not-allowed"
                      />
                      <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatTime(duration)}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
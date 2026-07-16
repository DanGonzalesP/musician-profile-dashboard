"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3, Pause, Play } from "lucide-react";
import type { SingleData } from "@/lib/blocks";
import { setActiveAudio } from "@/lib/audio-bus";
import { claimNowPlaying, releaseNowPlaying } from "@/lib/now-playing";
import { useLocale } from "@/components/locale-provider";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FeaturedSingleBlock({ data }: { data: SingleData }) {
  const { t } = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const hasAudio = Boolean(data.audioUrl);

  const loadAndPlay = (skipCors = false) => {
    if (!data.audioUrl) return;
    const url = data.audioUrl;

    const audio = new Audio();
    audioRef.current = audio;
    loadedUrlRef.current = url;

    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(audio.duration || 0);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    audio.onerror = () => {
      if (!skipCors) {
        loadAndPlay(true);
        return;
      }
      // Fallaron ambos intentos (con y sin CORS): se limpian las referencias
      // para que el próximo click en Play cargue el archivo desde cero en
      // vez de reintentar sobre este mismo audio ya roto (si no, el botón
      // queda atascado para siempre).
      if (audioRef.current === audio) {
        audioRef.current = null;
        loadedUrlRef.current = null;
      }
      setIsPlaying(false);
      setActiveAudio(null);
    };

    if (!skipCors) {
      audio.crossOrigin = "anonymous";
      setActiveAudio(audio);
    }

    audio.src = url;
    audio
      .play()
      .then(() => {
        claimNowPlaying("featured-single", () => {
          audio.pause();
          setIsPlaying(false);
        });
        setIsPlaying(true);
      })
      .catch(() => setIsPlaying(false));
  };

  const togglePlay = () => {
    if (!data.audioUrl) return;
    const audio = audioRef.current;

    if (audio && loadedUrlRef.current === data.audioUrl) {
      if (audio.paused) {
        audio
          .play()
          .then(() => {
            claimNowPlaying("featured-single", () => {
              audio.pause();
              setIsPlaying(false);
            });
            setIsPlaying(true);
          })
          .catch(() => setIsPlaying(false));
      } else {
        audio.pause();
        setIsPlaying(false);
        releaseNowPlaying("featured-single");
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
    loadAndPlay();
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
      }
      releaseNowPlaying("featured-single");
      setActiveAudio(null);
    };
  }, []);

  if (!hasAudio) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border sm:size-28">
            <Disc3 className="size-8 text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Disc3 className="size-3.5" />
              {t("single_eyebrow")}
            </span>
            <h3 className="mt-1 font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {t("single_upcoming_title")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("single_upcoming_subtitle")}</p>
          </div>

          <button
            type="button"
            disabled
            aria-label={t("single_play_aria")}
            className="flex size-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-input opacity-60"
          >
            <Play className="size-4 text-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="relative flex size-24 shrink-0 items-center justify-center sm:size-28">
          <div
            aria-hidden
            className={`absolute inset-0 rounded-full blur-lg transition-opacity duration-500 ${
              isPlaying ? "opacity-100" : "opacity-40"
            }`}
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--primary) 45%, transparent) 0%, transparent 70%)",
            }}
          />

          <div
            className="relative flex size-full animate-spin items-center justify-center rounded-full shadow-xl"
            style={{
              background:
                "repeating-radial-gradient(circle, #111 0px, #111 3px, #262626 4px, #111 5px)",
              animationDuration: "6s",
              animationPlayState: isPlaying ? "running" : "paused",
            }}
          >
            <img
              src={data.cover}
              alt={t("single_cover_alt")}
              className="size-20 rounded-full border-2 border-black/70 object-cover sm:size-24"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Disc3 className="size-3.5" />
            {t("single_eyebrow")}
          </span>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <h3 className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {data.title}
            </h3>
            {(data.genre || data.year) && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {[data.genre, data.year].filter(Boolean).join(" • ")}
              </span>
            )}
            {data.description && (
              <span className="min-w-0 truncate text-xs leading-relaxed text-muted-foreground">
                — {data.description}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? t("single_pause_aria") : t("single_play_aria")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_55%,transparent)] transition-opacity hover:opacity-90"
            >
              {isPlaying ? (
                <Pause className="size-4 fill-primary-foreground" />
              ) : (
                <Play className="ml-0.5 size-4 fill-primary-foreground" />
              )}
            </button>

            <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted-foreground">
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
              className="h-1 w-full flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary disabled:cursor-not-allowed"
            />

            <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
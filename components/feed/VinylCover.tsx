// components/feed/VinylCover.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

interface VinylCoverProps {
  coverImageUrl?: string;
  isActive: boolean;
  isPlaying: boolean;
  onTap: () => void;
}

type Phase = "idle" | "entering" | "settled" | "leaving";

export default function VinylCover({
  coverImageUrl,
  isActive,
  isPlaying,
  onTap,
}: VinylCoverProps) {
  const [phase, setPhase] = useState<Phase>(isActive ? "entering" : "idle");
  const wasActive = useRef(isActive);

  useEffect(() => {
    if (isActive && !wasActive.current) {
      setPhase("entering");
      wasActive.current = true;
      const t = setTimeout(() => setPhase("settled"), 350);
      return () => clearTimeout(t);
    }
    if (!isActive && wasActive.current) {
      setPhase("leaving");
      wasActive.current = false;
      const t = setTimeout(() => setPhase("idle"), 280);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  const animationClass =
    phase === "entering" ? "animate-vinyl-drop" : phase === "leaving" ? "animate-vinyl-retract" : "";

  return (
    <button
      type="button"
      onClick={onTap}
      className="group relative flex aspect-square w-64 items-center justify-center sm:w-72"
      aria-label={isPlaying ? "Pausar" : "Reproducir"}
    >
      {phase !== "idle" && (
        <div
          aria-hidden
          className="absolute -right-2 -top-4 h-24 w-16 origin-top-right transition-transform duration-500 ease-out"
          style={{ transform: isPlaying ? "rotate(18deg)" : "rotate(38deg)" }}
        >
          <div className="ml-auto h-full w-1.5 rounded-full bg-border" />
          <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-primary" />
        </div>
      )}

      <div
        className={`relative h-full w-full overflow-hidden rounded-full border-4 border-border bg-card shadow-2xl ${animationClass} ${
          isPlaying ? "animate-spin" : ""
        }`}
        style={isPlaying ? { animationDuration: "6s" } : undefined}
      >
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-card" />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-inset ring-background/20" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-background/80" />
      </div>

      {!isPlaying && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-10 w-10 fill-primary-foreground text-primary-foreground" />
        </span>
      )}
    </button>
  );
}
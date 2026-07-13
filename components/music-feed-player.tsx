"use client";

import { useState, useRef, useEffect } from "react";
import { FeedTrack } from "@/lib/musicFeed";
import { Play, Pause, Music, AlertCircle } from "lucide-react";

interface TrackPlayerProps {
  track: FeedTrack;
  isPlaying: boolean;
  onPlay: (id: string) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function TrackItem({ track, isPlaying, onPlay }: TrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(() => setHasError(true));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const togglePlay = () => {
    if (hasError) return;
    if (isPlaying) {
      audioRef.current?.pause();
      onPlay(""); // Pausar todo
    } else {
      onPlay(track.id);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-card border border-border rounded-lg shadow-sm w-full">
      <audio
        ref={audioRef}
        src={track.audioUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => onPlay("")}
        onError={() => setHasError(true)}
        className="hidden"
      />
      
      {/* Portada */}
      <div className="w-16 h-16 bg-muted rounded-md shrink-0 flex items-center justify-center overflow-hidden">
        {track.coverImageUrl ? (
          <img src={track.coverImageUrl} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music className="w-8 h-8 text-muted-foreground opacity-50" />
        )}
      </div>

      {/* Info y Controles */}
      <div className="flex-1 min-w-0 w-full flex flex-col justify-center">
        <div className="flex items-center justify-between mb-2">
          <div className="truncate pr-2">
            <h4 className="text-sm font-semibold text-foreground truncate">{track.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{track.artistName}</p>
          </div>
          
          <button
            onClick={togglePlay}
            disabled={hasError}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasError ? (
              <AlertCircle className="w-5 h-5" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-1" />
            )}
          </button>
        </div>

        {/* Barra de progreso */}
        {hasError ? (
          <p className="text-xs text-destructive">Error al cargar el audio</p>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
              {formatTime(progress)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1.5 rounded-full appearance-none bg-secondary cursor-pointer accent-primary"
              aria-label="Barra de progreso"
            />
            <span className="text-[10px] tabular-nums text-muted-foreground w-8">
              {formatTime(duration)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MusicFeedPlayer({ tracks }: { tracks: FeedTrack[] }) {
  const [playingId, setPlayingId] = useState<string>("");

  if (!tracks || tracks.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed border-border rounded-lg bg-card/50 text-muted-foreground">
        <Music className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p>No hay canciones publicadas aún.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {tracks.map((track) => (
        <TrackItem
          key={track.id}
          track={track}
          isPlaying={playingId === track.id}
          onPlay={setPlayingId}
        />
      ))}
    </div>
  );
}
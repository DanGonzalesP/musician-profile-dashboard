"use client";

import { useEffect, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import * as audioEngine from "@/lib/audio-engine";
import type { FeedTrack } from "@/lib/musicFeed";
import { AudioPlaybackError } from "@/components/audio-playback-error";

function timeLabel(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function MusicManagementPreview({ track, onClose }: { track: FeedTrack; onClose: () => void }) {
  const [engine, setEngine] = useState(audioEngine.getState);
  useEffect(() => audioEngine.subscribe(setEngine), []);
  const current = engine.url === track.audioUrl;
  const playing = current && engine.playing;
  const duration = current && Number.isFinite(engine.duration) ? Math.max(0, engine.duration) : 0;
  const position = current && Number.isFinite(engine.currentTime) ? Math.min(duration, Math.max(0, engine.currentTime)) : 0;

  return <section aria-label="Escuchar canción publicada" className="space-y-3 rounded-lg border border-primary/30 bg-card p-4">
    <div className="flex items-center gap-3">
      <button type="button" aria-label={`${playing ? "Pausar" : "Reproducir"} ${track.title}`} onClick={() => audioEngine.toggle(track.audioUrl)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {playing ? <Pause aria-hidden className="size-5" /> : <Play aria-hidden className="size-5" />}
      </button>
      <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Escucha de tu publicación</p><h4 className="break-words font-medium">{track.title}</h4></div>
      <button type="button" onClick={onClose} aria-label="Cerrar escucha" className="flex size-11 shrink-0 items-center justify-center rounded-lg border"><X aria-hidden className="size-5" /></button>
    </div>
    <label className="block text-sm">
      <span className="sr-only">Posición de reproducción de {track.title}</span>
      <input type="range" min={0} max={duration || 1} step={0.1} value={position} disabled={!current || duration === 0} aria-valuetext={`${timeLabel(position)} de ${timeLabel(duration)}`} onChange={event => { if (audioEngine.isCurrent(track.audioUrl)) audioEngine.seek(Number(event.target.value)); }} className="min-h-11 w-full accent-primary" />
    </label>
    <p className="text-xs tabular-nums text-muted-foreground">{timeLabel(position)} / {timeLabel(duration)}</p>
    {current && engine.error && <AudioPlaybackError onRetry={() => audioEngine.play(track.audioUrl)} />}
  </section>;
}

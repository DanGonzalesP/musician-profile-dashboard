"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  FeedTrack, 
  MUSIC_MANAGEMENT_PAGE_SIZE,
  fetchMusicFeed, 
  addTrackToFeed, 
  deleteTrackFromFeed, 
  validateMp3Url 
} from "@/lib/musicFeed";
import { Trash2, Link as LinkIcon, Play, Loader2 } from "lucide-react";
import type { CursorFeed } from "@/lib/feed/keyset";
import * as audioEngine from "@/lib/audio-engine";
import { safeUrlOrNull } from "@/lib/safe-url";
import { MusicManagementPreview } from "@/components/music-management-preview";

export default function MusicFeedForm() {
  const router = useRouter();
  
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [tracks, setTracks] = useState<FeedTrack[]>([]);
  const [previewTrack, setPreviewTrack] = useState<FeedTrack | null>(null);
  const previewUrl = useRef<string | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<CursorFeed | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const loadVersion = useRef(0);
  
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionLock = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const [retry, setRetry] = useState(0);
  const busy = isSubmitting || deletingId !== null || loadingMore;
  const search = query.trim().toLocaleLowerCase("es");
  const filteredTracks = tracks.filter(track => track.title.toLocaleLowerCase("es").includes(search));
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => () => {
    if (previewUrl.current && audioEngine.isCurrent(previewUrl.current)) audioEngine.stop();
  }, []);

  function closePreview(restoreFocus = true) {
    if (previewUrl.current && audioEngine.isCurrent(previewUrl.current)) audioEngine.stop();
    previewUrl.current = null;
    setPreviewTrack(null);
    if (restoreFocus && previewTrigger.current?.isConnected) previewTrigger.current.focus();
  }

  function listen(track: FeedTrack, trigger: HTMLButtonElement) {
    const url = safeUrlOrNull(track.audioUrl);
    if (!url || (!url.startsWith("/") && !/^https?:\/\//i.test(url))) {
      setMessage({ text: "Esta publicación no tiene un enlace de audio reproducible.", type: "error" });
      return;
    }
    previewTrigger.current = trigger;
    previewUrl.current = url;
    setPreviewTrack({ ...track, audioUrl: url });
    audioEngine.play(url);
  }

  useEffect(() => {
    // Contador de generación, no un nodo DOM: la limpieza invalida su valor más reciente.
    const loadVersionRef = loadVersion;
    const version = ++loadVersionRef.current;
    async function loadData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (version !== loadVersion.current) return;
        if (authError || !user) {
          router.push("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (version !== loadVersion.current) return;
        if (profileError) throw profileError;

        // Sin fila de perfil no se sigue: antes se caía al perfil semilla
        // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
        if (!profile) throw new Error("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
        const resolvedProfileId = profile.id;
        setProfileId(resolvedProfileId);
        setDisplayName(profile?.display_name ?? "");

        const loadedTracks = await fetchMusicFeed(resolvedProfileId);
        if (version !== loadVersion.current) return;
        setTracks(loadedTracks);
        const last = loadedTracks.at(-1);
        setCursor(last ? { id: last.id, createdAt: last.createdAt } : null);
        setHasMore(loadedTracks.length === MUSIC_MANAGEMENT_PAGE_SIZE);
        setMoreError("");
        setLoadFailed(false);
        setRequiresReload(false);
      } catch {
        if (version !== loadVersion.current) return;
        setLoadFailed(true);
        setMessage({ text: "No pudimos cargar tu música. Revisa tu conexión y vuelve a intentarlo.", type: "error" });
      } finally {
        if (version === loadVersion.current) setIsLoading(false);
      }
    }
    loadData();
    return () => { loadVersionRef.current++; };
  }, [router, retry]);

  async function loadOlderTracks() {
    if (actionLock.current || !profileId || !cursor || !hasMore || loadFailed || requiresReload) return;
    actionLock.current = true;
    const version = loadVersion.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await fetchMusicFeed(profileId, cursor);
      if (version !== loadVersion.current) return;
      setTracks(current => {
        const known = new Set(current.map(track => track.id));
        return [...current, ...page.filter(track => !known.has(track.id))];
      });
      const last = page.at(-1);
      if (last) setCursor({ id: last.id, createdAt: last.createdAt });
      setHasMore(page.length === MUSIC_MANAGEMENT_PAGE_SIZE);
    } catch {
      if (version === loadVersion.current) setMoreError("No pudimos cargar las publicaciones anteriores. La lista se conserva; vuelve a intentarlo.");
    } finally {
      actionLock.current = false;
      if (version === loadVersion.current) setLoadingMore(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLock.current || !profileId || loadFailed || requiresReload || !title.trim()) return;
    setUrlError("");
    setMessage(null);

    if (!validateMp3Url(audioUrl.trim())) {
      setUrlError("Introduce un enlace directo a un archivo MP3, M4A, AAC o WAV.");
      return;
    }

    if (!profileId) return;

    actionLock.current = true;
    setIsSubmitting(true);
    try {
      const newTrack = await addTrackToFeed(profileId, title.trim(), audioUrl.trim());
      setTracks(current => [newTrack, ...current]);
      setTitle("");
      setAudioUrl("");
      setMessage({ text: "Canción publicada correctamente.", type: "success" });
    } catch {
      setRequiresReload(true);
      setMessage({ text: "No pudimos confirmar la publicación. Tus datos se conservan; recarga la lista antes de repetir para evitar duplicados.", type: "error" });
    } finally {
      actionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (trackId: string) => {
    if (actionLock.current || !profileId || loadFailed || requiresReload) return;
    if (!confirm("¿Seguro que deseas eliminar esta canción de tu feed?")) return;
    actionLock.current = true;
    setDeletingId(trackId);
    setMessage(null);
    try {
      await deleteTrackFromFeed(trackId, profileId);
      if (previewTrack?.id === trackId) closePreview(false);
      setTracks(current => current.filter((t) => t.id !== trackId));
      setMessage({ text: "Canción eliminada.", type: "success" });
    } catch {
      setRequiresReload(true);
      setMessage({ text: "No pudimos confirmar la eliminación. Recarga la lista antes de repetir.", type: "error" });
    } finally {
      actionLock.current = false;
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
        Cargando música…
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {message && (
        <div role={message.type === "error" ? "alert" : "status"} className={`p-4 rounded-md border ${
          message.type === "error" 
            ? "bg-destructive/10 border-destructive/20 text-destructive" 
            : "bg-primary/10 border-primary/20 text-foreground"
        }`}>
          {message.text}
          {message.type === "error" && <button type="button" disabled={busy} onClick={() => { closePreview(false); setIsLoading(true); setMessage(null); setRetry(value => value + 1); }} className="mt-3 block min-h-11 rounded-lg border border-current px-3">Recargar lista</button>}
        </div>
      )}

      {/* Formulario de publicación */}
      <section className="p-6 bg-card/60 border border-border rounded-lg">
        <h2 className="text-lg font-medium text-foreground mb-1">Nueva Publicación</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Publicando como: <strong className="text-foreground">{displayName}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={busy || loadFailed || requiresReload || !profileId} className="min-w-0 space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
              Nombre de la canción
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Mi Nueva Canción"
              className="w-full bg-background border border-border rounded-md py-2 px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="audioUrl" className="block text-sm font-medium text-foreground mb-1">
              Enlace público del audio
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                id="audioUrl"
                aria-invalid={!!urlError}
                aria-describedby={urlError ? "music-url-help music-url-error" : "music-url-help"}
                type="url"
                required
                value={audioUrl}
                onChange={(e) => {
                  setAudioUrl(e.target.value);
                  if (urlError) setUrlError("");
                }}
                placeholder="https://ejemplo.com/audio.mp3"
                className="w-full bg-background border border-border rounded-md py-2 pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <p id="music-url-help" className="mt-2 text-xs text-muted-foreground">Acepta enlaces directos a MP3, M4A, AAC o WAV. Para subir archivos desde tu dispositivo, usa el editor de tu perfil.</p>
            {urlError && <p id="music-url-error" role="alert" className="mt-1 text-sm text-destructive">{urlError}</p>}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Publicando...</>
              ) : (
                "Publicar en Feed"
              )}
            </button>
          </div>
          </fieldset>
        </form>
      </section>

      {/* Lista de canciones publicadas */}
      {!loadFailed && <section>
        <h3 className="text-lg font-medium text-foreground mb-4">Tus canciones publicadas</h3>
        {previewTrack && <div className="mb-4"><MusicManagementPreview track={previewTrack} onClose={() => closePreview()} /></div>}
        <label htmlFor="music-search" className="mb-2 block text-sm font-medium">Buscar por nombre</label>
        <input id="music-search" type="search" value={query} onChange={event => setQuery(event.target.value)} aria-describedby="music-search-scope" className="mb-2 min-h-11 w-full rounded-md border border-border bg-background px-3" placeholder="Nombre de una canción" />
        <p id="music-search-scope" className="mb-4 text-sm text-muted-foreground">La búsqueda se aplica a las canciones cargadas. Carga las anteriores para ampliar la lista.</p>
        <p role="status" className="mb-4 text-sm text-muted-foreground">{filteredTracks.length} coincidencias entre {tracks.length} canciones cargadas.</p>
        {tracks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no has publicado ninguna canción.</p>
        ) : filteredTracks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay canciones cargadas con ese nombre. Cambia la búsqueda o carga publicaciones anteriores.</p>
        ) : (
          <div className="space-y-3">
            {filteredTracks.map((track) => (
              <div key={track.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-4 overflow-hidden">
                  <button type="button" onClick={event => listen(track, event.currentTarget)} aria-label={`Escuchar ${track.title}`} className="size-11 bg-secondary rounded flex items-center justify-center shrink-0 hover:bg-primary/20">
                    <Play aria-hidden className="size-5 text-foreground" />
                  </button>
                  <div className="truncate">
                    <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.audioUrl}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || requiresReload}
                  aria-label={`Eliminar ${track.title}`}
                  onClick={() => handleDelete(track.id)}
                  title="Eliminar"
                  className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive hover:bg-secondary rounded-md transition-colors"
                >
                  {deletingId === track.id ? <Loader2 aria-label="Eliminando canción" className="size-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
        {moreError && <p role="alert" className="mt-4 text-sm text-destructive">{moreError}</p>}
        {hasMore && <button type="button" disabled={busy || requiresReload} onClick={() => void loadOlderTracks()} className="mt-4 min-h-11 rounded-lg border border-border px-4 disabled:opacity-50">{loadingMore ? "Cargando canciones…" : moreError ? "Reintentar carga de anteriores" : "Cargar canciones anteriores"}</button>}
      </section>}
    </div>
  );
}

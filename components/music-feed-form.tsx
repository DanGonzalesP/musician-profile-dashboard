"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  FeedTrack, 
  fetchMusicFeed, 
  addTrackToFeed, 
  deleteTrackFromFeed, 
  validateMp3Url 
} from "@/lib/musicFeed";
import { Trash2, Link as LinkIcon, Music, Loader2 } from "lucide-react";

export default function MusicFeedForm() {
  const router = useRouter();
  
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [tracks, setTracks] = useState<FeedTrack[]>([]);
  
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Perfil no encontrado.");

        setProfileId(profile.id);
        setDisplayName(profile.display_name);

        const loadedTracks = await fetchMusicFeed(profile.id);
        setTracks(loadedTracks);
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [router]);

  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      setMessage({ text: err.message, type: "error" });
      return;
    }
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const errorText = e.message || JSON.stringify(err);
    setMessage({ text: errorText, type: "error" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");
    setMessage(null);

    if (!validateMp3Url(audioUrl)) {
      setUrlError("Debe ser una URL válida que termine en .mp3");
      return;
    }

    if (!profileId) return;

    setIsSubmitting(true);
    try {
      const newTrack = await addTrackToFeed(profileId, title, audioUrl);
      setTracks([newTrack, ...tracks]);
      setTitle("");
      setAudioUrl("");
      setMessage({ text: "Canción publicada correctamente.", type: "success" });
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (trackId: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta canción de tu feed?")) return;
    
    try {
      await deleteTrackFromFeed(trackId);
      setTracks(tracks.filter((t) => t.id !== trackId));
      setMessage({ text: "Canción eliminada.", type: "success" });
    } catch (err) {
      handleError(err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {message && (
        <div className={`p-4 rounded-md border ${
          message.type === "error" 
            ? "bg-red-500/10 border-red-500/20 text-red-400" 
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        }`}>
          {message.text}
        </div>
      )}

      {/* Formulario de publicación */}
      <section className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-lg">
        <h2 className="text-lg font-medium text-white mb-1">Nueva Publicación</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Publicando como: <strong className="text-zinc-200">{displayName}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1">
              Nombre de la canción
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Mi Nueva Canción"
              className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div>
            <label htmlFor="audioUrl" className="block text-sm font-medium text-zinc-300 mb-1">
              URL pública del MP3
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-4 w-4 text-zinc-500" />
              </div>
              <input
                id="audioUrl"
                type="url"
                required
                value={audioUrl}
                onChange={(e) => {
                  setAudioUrl(e.target.value);
                  if (urlError) setUrlError("");
                }}
                placeholder="https://ejemplo.com/audio.mp3"
                className="w-full bg-black border border-zinc-800 rounded-md py-2 pl-10 pr-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            {urlError && <p className="mt-1 text-sm text-red-400">{urlError}</p>}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Publicando...</>
              ) : (
                "Publicar en Feed"
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Lista de canciones publicadas */}
      <section>
        <h3 className="text-lg font-medium text-white mb-4">Tus publicaciones recientes</h3>
        {tracks.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no has publicado ninguna canción.</p>
        ) : (
          <div className="space-y-3">
            {tracks.map((track) => (
              <div key={track.id} className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="w-10 h-10 bg-zinc-900 rounded flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{track.audioUrl}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(track.id)}
                  title="Eliminar"
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-md transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
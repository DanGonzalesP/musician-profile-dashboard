import { supabase } from "@/lib/supabase";

export interface FeedTrack {
  id: string;
  profileId: string;
  title: string;
  audioUrl: string;
  coverImageUrl?: string;
  durationSeconds?: number;
  artistName: string;
  createdAt: string;
}

// Interfaz interna que refleja la tabla incluyendo el join con profiles
export interface FeedTrackRow {
  id: string;
  profile_id: string;
  title: string;
  audio_url: string;
  cover_image_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  profiles: { display_name: string } | null;
}

const VALID_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav"];

export function validateMp3Url(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    return VALID_AUDIO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch (error) {
    return false;
  }
}

function mapRowToTrack(row: FeedTrackRow): FeedTrack {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    audioUrl: row.audio_url,
    coverImageUrl: row.cover_image_url || undefined,
    durationSeconds: row.duration_seconds || undefined,
    artistName: row.profiles?.display_name || "Artista Desconocido",
    createdAt: row.created_at,
  };
}

export async function fetchMusicFeed(profileId: string): Promise<FeedTrack[]> {
  const { data, error } = await supabase
    .from("music_feed")
    .select(`
      id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
      profiles ( display_name )
    `)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as FeedTrackRow[]).map(mapRowToTrack);
}

export async function fetchAllPublicFeed(limit: number = 50): Promise<FeedTrack[]> {
  const { data, error } = await supabase
    .from("music_feed")
    .select(`
      id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
      profiles ( display_name )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as FeedTrackRow[]).map(mapRowToTrack);
}

export async function addTrackToFeed(
  profileId: string,
  title: string,
  audioUrl: string,
  coverImageUrl?: string
): Promise<FeedTrack> {
  if (!validateMp3Url(audioUrl)) {
    throw new Error("La URL proporcionada no es válida o no apunta a un archivo .mp3.");
  }

  const { data, error } = await supabase
    .from("music_feed")
    .insert({
      profile_id: profileId,
      title,
      audio_url: audioUrl,
      cover_image_url: coverImageUrl,
    })
    .select(`
      id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
      profiles ( display_name )
    `)
    .single();

  if (error) throw error;
  return mapRowToTrack(data as unknown as FeedTrackRow);
}

export async function deleteTrackFromFeed(trackId: string): Promise<void> {
  const { error } = await supabase
    .from("music_feed")
    .delete()
    .eq("id", trackId);

  if (error) throw error;
}
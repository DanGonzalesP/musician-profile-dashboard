import { supabase } from "@/lib/supabase";
import { expresionKeyset, type CursorFeed } from "@/lib/feed/keyset";
import { parseMusicianRoles, type MusicianRole } from "@/lib/musician-roles";

export interface FeedTrack {
  id: string;
  profileId: string;
  title: string;
  audioUrl: string;
  coverImageUrl?: string;
  durationSeconds?: number;
  artistName: string;
  // Roles profesionales del autor de la pista (filtro del feed). Vacío si
  // el perfil no eligió ninguno todavía.
  roles: MusicianRole[];
  // true si la pista pertenece a la página de un grupo musical
  // (profiles.profile_type = 'band') — filtro "Grupos" de la barra lateral.
  isGroup: boolean;
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
  profiles: {
    display_name: string;
    musician_roles?: unknown;
    musician_category?: string | null;
    profile_type?: string | null;
    is_suspended?: boolean | null;
  } | null;
}

const VALID_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav"];

export function validateMp3Url(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    return VALID_AUDIO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function mapRowToTrack(row: FeedTrackRow): FeedTrack {
  // musician_roles (nuevo, text[]) manda; si no existe todavía se cae a la
  // vieja musician_category (string) — parseMusicianRoles traduce ambas.
  const rawRoles = row.profiles?.musician_roles ?? row.profiles?.musician_category;
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    audioUrl: row.audio_url,
    coverImageUrl: row.cover_image_url || undefined,
    durationSeconds: row.duration_seconds || undefined,
    artistName: row.profiles?.display_name || "Artista Desconocido",
    roles: parseMusicianRoles(rawRoles),
    isGroup: row.profiles?.profile_type === "band",
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

/**
 * Página del feed público de pistas.
 *
 * `cursor` habilita la paginación keyset (P-17): en vez de "saltea N", se pide
 * "lo que va después de esta fila", así el contenido que entra entre página y
 * página no provoca repeticiones ni saltos. Sin cursor devuelve la primera
 * página, que es exactamente lo que hacía antes.
 */
export async function fetchAllPublicFeed(limit: number = 50, cursor?: CursorFeed): Promise<FeedTrack[]> {
  // Se intenta con las columnas más nuevas primero; si alguna migración no
  // corrió todavía en Supabase, el select falla y se degrada al siguiente
  // intento — el feed nunca se cae por una columna faltante.
  const selects = [
    `id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
     profiles ( display_name, musician_roles, profile_type, is_suspended )`,
    `id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
     profiles ( display_name, musician_category, profile_type, is_suspended )`,
    `id, profile_id, title, audio_url, cover_image_url, duration_seconds, created_at,
     profiles ( display_name )`,
  ];

  let lastError: unknown = null;
  for (const select of selects) {
    // El segundo criterio de orden (`id desc`) no es decorativo: sin un orden
    // TOTAL, dos filas con el mismo `created_at` pueden salir en cualquier
    // orden entre consultas, y la paginación por cursor se cuelga repitiendo
    // el mismo bloque.
    let consulta = supabase
      .from("music_feed")
      .select(select)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (cursor) consulta = consulta.or(expresionKeyset(cursor));

    const { data, error } = await consulta;
    if (!error) {
      // Segunda capa de la suspensión (P-34). La RLS de 0008 sólo oculta el
      // contenido de profile_blocks; music_feed es una tabla aparte que esa
      // política no cubre, así que las pistas de un perfil suspendido seguirían
      // apareciendo en el feed si confiáramos únicamente en la base. Se filtra
      // también aquí — sin efecto para los perfiles no suspendidos.
      const filas = (data as unknown as FeedTrackRow[]).filter(
        (fila) => fila.profiles?.is_suspended !== true
      );
      return filas.map(mapRowToTrack);
    }
    lastError = error;
  }
  throw lastError;
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
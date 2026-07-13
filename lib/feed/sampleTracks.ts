// lib/feed/sampleTracks.ts
import type { FeedTrack } from "@/lib/musicFeed";

/**
 * Data de ejemplo para el feed público mientras no haya canciones reales
 * publicadas en `music_feed`. NUNCA se mezcla con fetchAllPublicFeed(): se
 * usa solo como fallback cuando esa función devuelve un arreglo vacío.
 */
export const SAMPLE_FEED_TRACKS: FeedTrack[] = [
  {
    id: "sample-1",
    profileId: "sample-artist-1",
    title: "Andén Nocturno",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-1/500/500",
    artistName: "Mateo Rivas",
    createdAt: "2026-06-01T12:00:00.000Z",
  },
  {
    id: "sample-2",
    profileId: "sample-artist-2",
    title: "Cumbia del Puerto",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-2/500/500",
    artistName: "La Kimberly",
    createdAt: "2026-06-02T12:00:00.000Z",
  },
  {
    id: "sample-3",
    profileId: "sample-artist-3",
    title: "Neón y Cemento",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-3/500/500",
    artistName: "Circuito Sur",
    createdAt: "2026-06-03T12:00:00.000Z",
  },
  {
    id: "sample-4",
    profileId: "sample-artist-4",
    title: "Trap de Barranco",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-4/500/500",
    artistName: "Jhamil MC",
    createdAt: "2026-06-04T12:00:00.000Z",
  },
  {
    id: "sample-5",
    profileId: "sample-artist-5",
    title: "Huayno Eléctrico",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-5/500/500",
    artistName: "Sonqoy",
    createdAt: "2026-06-05T12:00:00.000Z",
  },
  {
    id: "sample-6",
    profileId: "sample-artist-6",
    title: "Marea Alta",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-6/500/500",
    artistName: "Valentina Ossio",
    createdAt: "2026-06-06T12:00:00.000Z",
  },
  {
    id: "sample-7",
    profileId: "sample-artist-7",
    title: "Callao 4AM",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-7/500/500",
    artistName: "Diego Lóstumo",
    createdAt: "2026-06-07T12:00:00.000Z",
  },
  {
    id: "sample-8",
    profileId: "sample-artist-8",
    title: "Ámbar",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    coverImageUrl: "https://picsum.photos/seed/decima-8/500/500",
    artistName: "Renata Solano",
    createdAt: "2026-06-08T12:00:00.000Z",
  },
];
import { fetchAllPublicFeed } from "@/lib/musicFeed";
import { buildMixedFeed, fetchPublicPosts, type FeedItem } from "@/lib/feed/publicPosts";
import { SAMPLE_FEED_TRACKS } from "@/lib/feed/sampleTracks";
import FeedExperience from "@/components/feed/FeedExperience";
import FeedHeader from "@/components/feed/FeedHeader";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";

// Sin esto, Next.js pre-renderiza esta página UNA vez en el build y la
// congela: si en ese momento `music_feed` estaba vacía, quedaba sirviendo
// SAMPLE_FEED_TRACKS para siempre, sin importar cuántas canciones reales se
// publicaran después. force-dynamic obliga a re-consultar Supabase en cada
// visita, para que una canción recién subida reemplace el fallback de
// inmediato (y el orden aleatorio del feed mixto cambie en cada carga).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [realTracks, posts] = await Promise.all([
    fetchAllPublicFeed(),
    fetchPublicPosts(),
  ]);

  const isSampleFeed = realTracks.length === 0 && posts.length === 0;
  const items: FeedItem[] = isSampleFeed
    ? SAMPLE_FEED_TRACKS.map((track) => ({ kind: "track", id: `track-${track.id}`, track }))
    : buildMixedFeed(realTracks, posts);

  return (
    <main className="relative h-dvh w-full text-foreground">
      <AudioReactiveBackground />
      <FeedHeader />
      <FeedExperience items={items} isSampleFeed={isSampleFeed} />
    </main>
  );
}

import { fetchAllPublicFeed } from "@/lib/musicFeed";
import { SAMPLE_FEED_TRACKS } from "@/lib/feed/sampleTracks";
import FeedExperience from "@/components/feed/FeedExperience";
import FeedHeader from "@/components/feed/FeedHeader";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";

// Sin esto, Next.js pre-renderiza esta página UNA vez en el build y la
// congela: si en ese momento `music_feed` estaba vacía, quedaba sirviendo
// SAMPLE_FEED_TRACKS para siempre, sin importar cuántas canciones reales se
// publicaran después. force-dynamic obliga a re-consultar Supabase en cada
// visita, para que una canción recién subida reemplace el fallback de
// inmediato.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const realTracks = await fetchAllPublicFeed();
  const isSampleFeed = realTracks.length === 0;
  const tracks = isSampleFeed ? SAMPLE_FEED_TRACKS : realTracks;

  return (
    <main className="relative h-dvh w-full text-foreground">
      <AudioReactiveBackground />
      <FeedHeader />
      <FeedExperience tracks={tracks} isSampleFeed={isSampleFeed} />
    </main>
  );
}

import { fetchPublicTrackPage } from "@/lib/musicFeed";
import { buildMixedFeed, fetchPublicPostPage, type FeedItem } from "@/lib/feed/publicPosts";
import { fetchProductSellers, fetchServiceProviders } from "@/lib/feed/discovery";
import { SAMPLE_FEED_TRACKS } from "@/lib/feed/sampleTracks";
import FeedExperience from "@/components/feed/FeedExperience";
import FeedHeader from "@/components/feed/FeedHeader";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";
import { logWarn } from "@/lib/log";

// Sin esto, Next.js pre-renderiza esta página UNA vez en el build y la
// congela: si en ese momento `music_feed` estaba vacía, quedaba sirviendo
// SAMPLE_FEED_TRACKS para siempre, sin importar cuántas canciones reales se
// publicaran después. force-dynamic obliga a re-consultar Supabase en cada
// visita, para que una canción recién subida reemplace el fallback de
// inmediato (y el orden aleatorio del feed mixto cambie en cada carga).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [tracksResult, postsResult, servicesResult, productsResult] = await Promise.allSettled([
    fetchPublicTrackPage(),
    fetchPublicPostPage(),
    fetchServiceProviders(),
    fetchProductSellers(),
  ]);

  const unavailable = {
    roles: tracksResult.status === "rejected" || postsResult.status === "rejected",
    servicios: servicesResult.status === "rejected",
    productos: productsResult.status === "rejected",
  };
  for (const [section, failed] of Object.entries(unavailable)) {
    if (failed) logWarn("/", "Sección del inicio no disponible", { seccion: section, resultado: "error" });
  }
  const realTracks = tracksResult.status === "fulfilled" ? tracksResult.value.items : [];
  const posts = postsResult.status === "fulfilled" ? postsResult.value.items : [];
  const serviceProviders = servicesResult.status === "fulfilled" ? servicesResult.value : [];
  const productSellers = productsResult.status === "fulfilled" ? productsResult.value : [];

  const isSampleFeed = !unavailable.roles && realTracks.length === 0 && posts.length === 0
    && tracksResult.status === "fulfilled" && !tracksResult.value.more
    && postsResult.status === "fulfilled" && !postsResult.value.more;
  const items: FeedItem[] = isSampleFeed
    ? SAMPLE_FEED_TRACKS.map((track) => ({ kind: "track", id: `track-${track.id}`, track }))
    : buildMixedFeed(realTracks, posts);

  return (
    <main className="relative h-dvh w-full text-foreground">
      <AudioReactiveBackground />
      <FeedHeader />
      <FeedExperience
        items={items}
        isSampleFeed={isSampleFeed}
        serviceProviders={serviceProviders}
        productSellers={productSellers}
        unavailable={unavailable}
        pagination={{
          tracks: tracksResult.status === "fulfilled" ? { cursor: tracksResult.value.cursor, more: tracksResult.value.more } : { cursor: null, more: false },
          posts: postsResult.status === "fulfilled" ? { cursor: postsResult.value.cursor, more: postsResult.value.more } : { cursor: null, more: false },
        }}
      />
    </main>
  );
}

import Link from "next/link";
import { fetchAllPublicFeed } from "@/lib/musicFeed";
import { SAMPLE_FEED_TRACKS } from "@/lib/feed/sampleTracks";
import FeedContainer from "@/components/feed/FeedContainer";

export default async function HomePage() {
  const realTracks = await fetchAllPublicFeed();
  const isSampleFeed = realTracks.length === 0;
  const tracks = isSampleFeed ? SAMPLE_FEED_TRACKS : realTracks;

  return (
    <main className="relative h-dvh w-full bg-background text-foreground">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-linear-to-b from-background/90 to-transparent px-6 py-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            D
          </div>
          <span className="text-lg font-semibold text-foreground">Décima</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/login?modo=registro"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Registrarse
          </Link>
        </div>
      </header>

      <FeedContainer tracks={tracks} isSampleFeed={isSampleFeed} />
    </main>
  );
}

"use client"

// Pantalla de una publicación (foto/video de un usuario) dentro del feed
// mixto. Mismo snap vertical que las canciones; el video se reproduce solo
// mientras la pantalla está activa. El rail de acciones ofrece like y
// compartir (los comentarios, por ahora, son solo de canciones).

import { forwardRef, useEffect, useRef } from "react"
import { ImageIcon, Play, Users } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import type { FeedPost } from "@/lib/feed/publicPosts"
import ActionRail from "./ActionRail"
import MarqueeText from "./MarqueeText"

interface PostScreenProps {
  post: FeedPost
  isActive: boolean
  isLiked: boolean
  onToggleLike: () => void
}

const PostScreen = forwardRef<HTMLDivElement, PostScreenProps>(function PostScreen(
  { post, isActive, isLiked, onToggleLike },
  ref
) {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isActive) {
      video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
  }, [isActive])

  const authorSlug = post.authorName.trim().toLowerCase().replace(/\s+/g, "-")

  return (
    <section
      ref={ref}
      className="relative flex h-dvh w-full snap-start snap-always items-center justify-center overflow-hidden px-6 pb-24 pt-24"
    >
      {/* Fondo difuminado con el propio medio */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-25 blur-3xl"
        style={{ backgroundImage: `url(${post.thumbnail || post.url})` }}
      />

      <div className="flex w-full max-w-sm flex-col gap-4 sm:max-w-md">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur">
          <ImageIcon className="size-3" /> {t("feed_post_badge")}
        </span>

        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-black shadow-2xl">
          {post.mediaType === "video" ? (
            <video
              ref={videoRef}
              src={post.url}
              poster={post.thumbnail}
              loop
              muted
              playsInline
              className="max-h-[55dvh] w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.url}
              alt={post.caption || post.authorName}
              className="max-h-[55dvh] w-full object-contain"
            />
          )}
          {post.mediaType === "video" && !isActive && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
                <Play className="ml-0.5 size-6 fill-white" />
              </span>
            </span>
          )}
        </div>

        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <MarqueeText text={post.authorName} className="text-base font-bold text-primary" />
            {post.isGroup && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Users className="size-2.5" /> {t("profile_band_badge")}
              </span>
            )}
          </span>
          {post.caption && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground/85">
              {post.caption}
            </p>
          )}
        </div>
      </div>

      <div className="absolute bottom-28 right-4 z-20 sm:right-6">
        <ActionRail
          isLiked={isLiked}
          likeCount={isLiked ? 1 : 0}
          onToggleLike={onToggleLike}
          shareUrl={`/${authorSlug}`}
          shareTitle={post.caption || post.authorName}
        />
      </div>
    </section>
  )
})

export default PostScreen

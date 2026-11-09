"use client"

// Pantalla de una publicación (foto/video de un usuario) dentro del feed
// mixto. Mismo snap vertical que las canciones; el video se reproduce solo
// mientras la pantalla está activa.

import { forwardRef, useEffect, useId, useRef, useState } from "react"
import { ImageIcon, Play, Users } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import type { FeedPost } from "@/lib/feed/publicPosts"
import ActionRail from "./ActionRail"
import AuthorProfileLink from "./AuthorProfileLink"

interface PostScreenProps {
  post: FeedPost
  isActive: boolean
  isLiked: boolean
  onToggleLike: () => void
  onOpenComments: () => void
}

const PostScreen = forwardRef<HTMLDivElement, PostScreenProps>(function PostScreen(
  { post, isActive, isLiked, onToggleLike, onOpenComments },
  ref
) {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaRegionRef = useRef<HTMLDivElement | null>(null)
  const [failedMedia, setFailedMedia] = useState<string | null>(null)
  const [mediaAttempt, setMediaAttempt] = useState(0)
  const mediaIdentity = `${post.mediaType}:${post.url}:${mediaAttempt}`
  const mediaFailed = failedMedia === mediaIdentity
  const [expanded, setExpanded] = useState(false)
  const captionId = useId()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isActive) {
      video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
    return () => { video.pause() }
  }, [isActive, mediaIdentity])

  return (
    <section
      ref={ref}
      className="relative flex h-dvh w-full snap-start snap-always items-center justify-center overflow-hidden pl-4 pr-20 pb-24 pt-48 sm:pl-6 sm:pr-24 lg:pt-24"
    >
      {/* Fondo difuminado con el propio medio */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-25 blur-3xl"
        style={{ backgroundImage: `url(${post.thumbnail || post.url})` }}
      />

      <div
        role="group"
        aria-label={`${t("feed_post_badge")} — ${post.authorName}`}
        tabIndex={0}
        className="flex h-full min-h-0 w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:max-w-md"
      >
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur">
          <ImageIcon className="size-3" /> {t("feed_post_badge")}
        </span>

        <div
          ref={mediaRegionRef}
          role="group"
          aria-label={t("feed_post_media")}
          tabIndex={-1}
          className="relative flex min-h-32 flex-1 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-border/60 bg-black shadow-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {post.mediaType === "video" ? (
            <video
              key={mediaIdentity}
              ref={videoRef}
              src={post.url}
              poster={post.thumbnail}
              controls={isActive && !mediaFailed}
              preload={isActive ? "metadata" : "none"}
              aria-label={post.caption || post.authorName}
              onError={() => setFailedMedia(mediaIdentity)}
              loop
              muted
              playsInline
              className="h-full max-h-full w-full object-contain"
            />
          ) : (
            <img
              key={mediaIdentity}
              src={post.url}
              onError={() => setFailedMedia(mediaIdentity)}
              loading={isActive ? "eager" : "lazy"}
              alt={post.caption || post.authorName}
              className="h-full max-h-full w-full object-contain"
            />
          )}
          {mediaFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto bg-card p-3 text-center text-foreground">
              <p role={isActive ? "status" : undefined} className="text-sm">{t("feed_post_media_error")}</p>
              <button
                type="button"
                onClick={() => {
                  setMediaAttempt(value => value + 1)
                  mediaRegionRef.current?.focus({ preventScroll: true })
                }}
                className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t("feed_post_media_retry")}
              </button>
            </div>
          )}
          {post.mediaType === "video" && !isActive && !mediaFailed && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
                <Play className="ml-0.5 size-6 fill-white" />
              </span>
            </span>
          )}
        </div>

        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <AuthorProfileLink name={post.authorName} username={post.username} className="text-base font-bold text-primary" />
            {post.isGroup && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Users className="size-2.5" /> {t("profile_band_badge")}
              </span>
            )}
          </div>
          {post.caption && (
            <>
              <p id={captionId} className={`mt-1 break-words text-sm leading-relaxed text-foreground ${expanded ? "" : "line-clamp-2"}`}>
                {post.caption}
              </p>
              <button type="button" aria-expanded={expanded} aria-controls={captionId} onClick={() => setExpanded(value => !value)} className="min-h-11 rounded px-1 text-xs font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
                {expanded ? t("feed_post_less") : t("feed_post_more")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="absolute bottom-28 right-4 z-20 sm:right-6">
        <ActionRail isLiked={isLiked} onToggleLike={onToggleLike} onOpenComments={onOpenComments} />
      </div>
    </section>
  )
})

export default PostScreen

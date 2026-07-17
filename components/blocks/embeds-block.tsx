"use client"

import { motion } from "framer-motion"
import { Music2, PlayCircle, Video } from "lucide-react"
import { getYoutubeEmbedUrl } from "@/lib/youtube"
import type { EmbedItem, EmbedsData } from "@/lib/blocks"

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
}

export function EmbedsBlock({ data }: { data: EmbedsData }) {
  const youtubeItems = data.items
    .filter((item): item is EmbedItem & { platform: "youtube" } => item.platform === "youtube")
    .map((item) => ({ item, embedUrl: getYoutubeEmbedUrl(item.url) }))
    .filter(
      (entry): entry is { item: EmbedItem & { platform: "youtube" }; embedUrl: string } => entry.embedUrl !== null
    )

  const tiktokItems = data.items.filter((item) => item.platform === "tiktok")

  const isEmpty = youtubeItems.length === 0 && tiktokItems.length === 0

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Video className="size-3.5" />
        EMBEDS
      </span>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Todavía no hay videos ni clips.
        </div>
      ) : (
        <div className="space-y-6">
          {youtubeItems.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <PlayCircle className="size-4 text-primary" />
                Videos
              </h3>
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                {youtubeItems.map(({ item, embedUrl }) => (
                  <motion.div key={item.id} variants={cardVariants}>
                    <YoutubeCard item={item} embedUrl={embedUrl} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {tiktokItems.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Music2 className="size-4 text-primary" />
                TikTok
              </h3>
              <motion.div
                className="flex flex-wrap gap-4"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                {tiktokItems.map((item) => (
                  <motion.div key={item.id} variants={cardVariants}>
                    <TikTokCard item={item} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function YoutubeCard({ item, embedUrl }: { item: EmbedItem; embedUrl: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="aspect-video w-full">
        <iframe
          src={embedUrl}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={item.title ?? "Video de YouTube"}
        />
      </div>
      {item.title && (
        <p className="px-3 py-2.5 text-sm font-medium text-foreground">{item.title}</p>
      )}
    </div>
  )
}

function TikTokCard({ item }: { item: EmbedItem }) {
  return (
    <div className="flex w-48 shrink-0 flex-col gap-2 sm:w-56">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-card/60">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title ?? "Clip de TikTok"}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-card via-background to-black">
            <Music2 className="size-10 text-primary/80" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-background/95 via-background/40 to-transparent p-3">
          {item.title && (
            <p className="line-clamp-2 text-xs font-medium text-foreground">{item.title}</p>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
          >
            Ver en TikTok
          </a>
        </div>
      </div>
    </div>
  )
}

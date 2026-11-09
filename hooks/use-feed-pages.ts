"use client"

import { useEffect, useRef, useState } from "react"
import { fetchPublicTrackPage } from "@/lib/musicFeed"
import { buildMixedFeed, fetchPublicPostPage, type FeedItem, type MixedFeedCursor } from "@/lib/feed/publicPosts"

export function useFeedPages(source: FeedItem[], pagination: MixedFeedCursor) {
  const [state, setState] = useState({ source, items: source, pagination, loading: false, error: "" })
  const pending = useRef<AbortController | null>(null)
  if (state.source !== source) setState({ source, items: source, pagination, loading: false, error: "" })
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [source])

  async function loadMore() {
    if (pending.current || (!state.pagination.tracks.more && !state.pagination.posts.more)) return
    const controller = new AbortController()
    pending.current = controller
    const before = state.pagination
    setState(previous => ({ ...previous, loading: true, error: "" }))
    try {
      // Publicar ambos resultados juntos. Un fallo conserva ambos cursores para
      // reintentar sin perder el lote que sí respondió ni saltarse contenido.
      const [tracks, posts] = await Promise.all([
        before.tracks.more ? fetchPublicTrackPage(50, before.tracks.cursor ?? undefined, controller.signal) : null,
        before.posts.more ? fetchPublicPostPage(60, before.posts.cursor ?? undefined, controller.signal) : null,
      ])
      if (controller.signal.aborted) return
      const additions = buildMixedFeed(tracks?.items ?? [], posts?.items ?? [])
      setState(previous => {
        if (previous.source !== source) return previous
        const known = new Set(previous.items.map(item => item.id))
        return { ...previous, items: [...previous.items, ...additions.filter(item => !known.has(item.id))],
          pagination: {
            tracks: tracks ? { cursor: tracks.cursor, more: tracks.more } : before.tracks,
            posts: posts ? { cursor: posts.cursor, more: posts.more } : before.posts,
          }, loading: false, error: "" }
      })
    } catch {
      if (!controller.signal.aborted) setState(previous => previous.source !== source ? previous : {
        ...previous, loading: false, error: "No pudimos cargar más contenido. Puedes reintentar sin perder lo que ya cargaste." })
      controller.abort()
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  return { items: state.items, more: state.pagination.tracks.more || state.pagination.posts.more,
    loading: state.loading, error: state.error, loadMore }
}

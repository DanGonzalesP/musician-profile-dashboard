"use client"

import { useEffect, useRef, useState } from "react"
import { DISCOVERY_PROFILE_LIMIT, fetchProductSellers, fetchServiceProviders, type DiscoveryProfile } from "@/lib/feed/discovery"

function initialState(source: DiscoveryProfile[]) {
  return { source, profiles: source, cursor: source.at(-1), more: source.length === DISCOVERY_PROFILE_LIMIT, loading: false, error: "" }
}

export function useDiscoveryPages(source: DiscoveryProfile[], kind: "productos" | "servicios") {
  const [state, setState] = useState(() => initialState(source))
  const pending = useRef<AbortController | null>(null)
  if (state.source !== source) setState(initialState(source))

  useEffect(() => () => {
    pending.current?.abort()
    pending.current = null
  }, [source, kind])

  async function loadMore() {
    if (pending.current || !state.more || !state.cursor) return
    const controller = new AbortController()
    pending.current = controller
    const cursor = { count: state.cursor.count, slug: state.cursor.slug }
    setState(previous => ({ ...previous, loading: true, error: "" }))
    try {
      const page = await (kind === "productos" ? fetchProductSellers : fetchServiceProviders)(cursor, controller.signal)
      if (controller.signal.aborted) return
      setState(previous => {
        if (previous.source !== source) return previous
        // Un catálogo puede cambiar entre páginas: reemplazar coincidencias por
        // UUID y avanzar con la última fila CRUDA, no con las visibles/filtradas.
        const profiles = new Map(previous.profiles.map(profile => [profile.profileId, profile]))
        for (const profile of page) profiles.set(profile.profileId, profile)
        return { ...previous, profiles: [...profiles.values()], cursor: page.at(-1) ?? previous.cursor,
          more: page.length === DISCOVERY_PROFILE_LIMIT, loading: false, error: "" }
      })
    } catch {
      if (controller.signal.aborted) return
      setState(previous => previous.source !== source ? previous : { ...previous, loading: false,
        error: "No pudimos cargar más perfiles. Conservamos los que ya puedes ver; vuelve a intentarlo." })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  return { profiles: state.profiles, more: state.more, loading: state.loading, error: state.error, loadMore }
}

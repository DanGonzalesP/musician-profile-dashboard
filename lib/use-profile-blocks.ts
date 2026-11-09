"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { fetchPerfilesBloqueados } from "@/lib/moderation"

export const PROFILE_BLOCKS_CHANGED = "vibe:profile-blocks-changed"

export function useProfileBlocks() {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const identity = useRef<string | null | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    let generation = 0
    async function load() {
      const current = ++generation
      setLoading(true)
      setFailed(false)
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        const ids = session ? await fetchPerfilesBloqueados() : []
        if (!active || current !== generation) return
        setBlockedIds(new Set(ids))
        setReady(true)
        setLoading(false)
      } catch {
        if (!active || current !== generation) return
        setFailed(true)
        setLoading(false)
      }
    }
    // Diferir trabajo de Auth fuera del callback evita consultas anidadas en su lock.
    const schedule = () => { void Promise.resolve().then(() => { if (active) void load() }) }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      if (identity.current !== userId) {
        identity.current = userId
        generation += 1
        setReady(false)
        setBlockedIds(new Set())
      }
      schedule()
    })
    window.addEventListener(PROFILE_BLOCKS_CHANGED, schedule)
    window.addEventListener("focus", schedule)
    schedule()
    return () => {
      active = false
      generation += 1
      subscription.unsubscribe()
      window.removeEventListener(PROFILE_BLOCKS_CHANGED, schedule)
      window.removeEventListener("focus", schedule)
    }
  }, [revision])
  return { blockedIds, loading, failed, ready, reload: () => setRevision(value => value + 1) }
}

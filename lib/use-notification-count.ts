"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { fetchPendingCreditRequestCount } from "@/lib/credit-requests"
import { fetchUnreadQuestionCount } from "@/lib/profile-questions"

export const NOTIFICATIONS_CHANGED = "vibe:notifications-changed"

/** null significa desconocido; nunca convertir un error en cero pendientes. */
export function useNotificationCount() {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    let generation = 0
    let previousUserId: string | null | undefined
    async function load() {
      const current = ++generation
      setCount(null); setLoading(true); setFailed(false)
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (!active || current !== generation) return
        if (error) throw new Error("session")
        if (!user) { setCount(null); setLoading(false); return }
        const { data: auth, error: sessionError } = await supabase.auth.getSession()
        if (!active || current !== generation) return
        if (sessionError || !auth.session || auth.session.user.id !== user.id) throw new Error("session")
        const token = auth.session.access_token
        const profile = await supabase.from("profiles").select("id")
          .eq("user_id", user.id).eq("profile_type", "artist").maybeSingle()
          .setHeader("Authorization", `Bearer ${token}`)
        if (!active || current !== generation) return
        if (profile.error || !profile.data) throw new Error("profile")
        const [credits, questions] = await Promise.all([
          fetchPendingCreditRequestCount(profile.data.id, token), fetchUnreadQuestionCount(profile.data.id, token),
        ])
        if (!active || current !== generation) return
        setCount(credits + questions)
        setLoading(false)
      } catch {
        if (!active || current !== generation) return
        setCount(null); setFailed(true); setLoading(false)
      }
    }
    const refresh = () => { void load() }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null
      if (id === previousUserId) return
      previousUserId = id
      generation += 1
      setCount(null); setLoading(true); setFailed(false)
      // No llamar Auth de nuevo dentro de su callback: puede mantener un lock.
      void Promise.resolve().then(() => { if (active) refresh() })
    })
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh)
    window.addEventListener("focus", refresh)
    refresh()
    return () => {
      active = false; generation += 1; subscription.unsubscribe()
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])
  return { count, failed, loading }
}

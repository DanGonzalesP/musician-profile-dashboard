"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export function ModerationNotice({ refresh = 0 }: { refresh?: number }) {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    let previousOwner: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const owner = session?.user.id ?? null
      if (owner === previousOwner) return
      previousOwner = owner
      generation.current += 1
      setCount(null)
      setFailed(false)
      setRetry(value => value + 1)
    })
    return () => { generation.current += 1; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    let active = true
    const version = generation.current
    const isCurrent = () => active && version === generation.current
    async function load() {
      setCount(null)
      setFailed(false)
      try {
        const { data: auth, error: authError } = await supabase.auth.getSession()
        if (!isCurrent()) return
        if (authError || !auth.session) throw new Error("unavailable")
        const { data, error } = await supabase.rpc("my_moderation_notice_count")
          .setHeader("Authorization", `Bearer ${auth.session.access_token}`)
        if (error || !Number.isSafeInteger(data) || data < 0) throw new Error("unavailable")
        if (isCurrent()) setCount(data)
      } catch { if (isCurrent()) setFailed(true) }
    }
    void load()
    return () => { active = false }
  }, [refresh, retry])
  return <section aria-label="Avisos de moderación" className="space-y-2 rounded-xl border p-4 text-sm">
    <p role="status">{failed ? "No pudimos consultar los avisos de moderación." : count === null ? "Consultando avisos de moderación…" : count === 0 ? "No tienes decisiones o respuestas de moderación sin leer." : `Tienes ${count} expediente${count === 1 ? "" : "s"} con una decisión o respuesta sin leer.`}</p>
    <div className="flex flex-wrap items-center gap-4">
      <Link href="/perfil/moderacion" className="inline-flex min-h-11 items-center underline">Consultar decisiones y respuestas</Link>
      <button type="button" disabled={count === null && !failed} onClick={() => setRetry(value => value + 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Actualizar avisos</button>
    </div>
  </section>
}

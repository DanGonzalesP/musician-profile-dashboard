"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { SITE_URL } from "@/lib/site"
import { useLocale } from "@/components/locale-provider"

export default function ConfirmarCorreoPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(false)
  const retryAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current || Date.now() < retryAt.current) return
    lock.current = true
    setBusy(true)
    setSent(false)
    try {
      await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${SITE_URL.replace(/\/$/, "")}/login` } })
    } catch {
      // Identical public response for existing, unknown and confirmed accounts.
    } finally {
      lock.current = false
      retryAt.current = Date.now() + 60_000
      if (mounted.current) {
        setBusy(false)
        setSent(true)
        setWaiting(true)
        timer.current = setTimeout(() => { if (mounted.current) setWaiting(false) }, 60_000)
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6">
        <Link href="/login" className="text-sm underline">{t("auth_recovery_back_to_login")}</Link>
        <h1 className="text-xl font-bold">{t("auth_confirmation_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth_confirmation_description")}</p>
        <form onSubmit={submit} aria-busy={busy} className="space-y-4">
          <label htmlFor="confirmation-email" className="block text-sm">{t("auth_email_label")}</label>
          <input id="confirmation-email" type="email" autoComplete="email" required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-lg border border-input bg-background p-3" />
          <button type="submit" disabled={busy || waiting} className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? t("auth_recovery_sending") : t("auth_confirmation_submit")}
          </button>
        </form>
        {sent && <p role="status" className="text-sm">{t("auth_confirmation_sent")}</p>}
        {waiting && <p className="text-xs text-muted-foreground">{t("auth_confirmation_wait")}</p>}
      </div>
    </main>
  )
}

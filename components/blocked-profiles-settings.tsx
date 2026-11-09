"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { PROFILE_BLOCKS_CHANGED } from "@/lib/use-profile-blocks"
import { BLOCKED_PROFILES_PAGE_SIZE, desbloquearPerfil, fetchBlockedProfileDetails, type BlockedProfile } from "@/lib/moderation"

export function BlockedProfilesSettings() {
  const [rows, setRows] = useState<BlockedProfile[]>([])
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState("")
  const [uncertain, setUncertain] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const lock = useRef(false)
  const sessionVersion = useRef(0)

  useEffect(() => {
    let previousUserId: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      if (userId === previousUserId) return
      previousUserId = userId
      sessionVersion.current += 1
      lock.current = false
      setBusyId(null)
      setRows([])
      setMessage("")
      setLoading(true)
      setPage(0)
      setRevision(value => value + 1)
    })
    return () => { sessionVersion.current += 1; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    void fetchBlockedProfileDetails(page).then(result => {
      if (!active) return
      setRows(result)
      setFailed(false)
      setUncertain(false)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setRows([])
      setFailed(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [page, revision])

  function reload(nextPage = page) {
    if (lock.current) return
    setLoading(true)
    setRows([])
    setMessage("")
    setPage(nextPage)
    setRevision(value => value + 1)
  }

  async function unblock(profile: BlockedProfile) {
    if (lock.current || loading || failed || uncertain) return
    if (!window.confirm(`¿Quitar a ${profile.displayName} de tu lista de bloqueos?`)) return
    lock.current = true
    const version = sessionVersion.current
    setBusyId(profile.profileId)
    setMessage("")
    try {
      await desbloquearPerfil(profile.profileId)
      window.dispatchEvent(new Event(PROFILE_BLOCKS_CHANGED))
      if (version !== sessionVersion.current) return
      setRows(previous => previous.filter(row => row.profileId !== profile.profileId))
      setMessage("Perfil retirado de tu lista de bloqueos.")
      setLoading(true)
      setPage(0)
      setRevision(value => value + 1)
    } catch {
      if (version !== sessionVersion.current) return
      setUncertain(true)
      setMessage("No pudimos confirmar el desbloqueo. Actualiza la lista antes de repetir la acción.")
    } finally {
      if (version === sessionVersion.current) { lock.current = false; setBusyId(null) }
    }
  }

  return (
    <section aria-labelledby="blocked-profiles-heading" className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 id="blocked-profiles-heading" className="text-lg font-semibold">Lista de perfiles bloqueados</h2>
      <p className="text-sm text-muted-foreground">Estos perfiles se ocultan de tu feed de música, publicaciones, servicios y productos. Esto no restringe el acceso a perfiles públicos ni las interacciones, y no sustituye un reporte de contenido.</p>
      <button type="button" disabled={loading || busyId !== null} onClick={() => reload(0)} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">Actualizar lista</button>
      {message && <p role={uncertain ? "alert" : "status"} className="text-sm">{message}</p>}
      {loading ? <p role="status" className="text-sm">Cargando bloqueos…</p> : failed ? (
        <p role="alert" className="text-sm text-destructive">No se pudo cargar la lista. Usa Actualizar lista para reintentar.</p>
      ) : rows.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{page === 0 ? "No hay perfiles en tu lista de bloqueos." : "No hay más perfiles en esta página."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(profile => <li key={profile.profileId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="wrap-break-word font-medium">{profile.displayName}</p>
              {profile.username && <p className="wrap-break-word text-sm text-muted-foreground">@{profile.username}</p>}
              <p className="text-xs text-muted-foreground">Añadido: <time dateTime={profile.createdAt}>{new Date(profile.createdAt).toLocaleDateString("es-PE")}</time></p>
            </div>
            <button type="button" aria-label={`Desbloquear a ${profile.displayName}`} disabled={busyId !== null || uncertain} onClick={() => void unblock(profile)} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">{busyId === profile.profileId ? "Desbloqueando…" : "Desbloquear"}</button>
          </li>)}
        </ul>
      )}
      <nav aria-label="Páginas de perfiles bloqueados" className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" disabled={loading || busyId !== null || page === 0} onClick={() => reload(page - 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Anterior</button>
        <span aria-live="polite">Página {page + 1}</span>
        <button type="button" disabled={loading || busyId !== null || failed || rows.length < BLOCKED_PROFILES_PAGE_SIZE} onClick={() => reload(page + 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Siguiente</button>
      </nav>
    </section>
  )
}

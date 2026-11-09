"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { bloquearPerfil, desbloquearPerfil } from "@/lib/moderation"
import { PROFILE_BLOCKS_CHANGED, useProfileBlocks } from "@/lib/use-profile-blocks"

export function ProfileBlockControl({ profileId }: { profileId: string }) {
  const { blockedIds, loading, failed, reload } = useProfileBlocks()
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState("")
  const lock = useRef(false)
  const blocked = blockedIds.has(profileId)

  async function toggle() {
    if (lock.current || loading || failed || uncertain) return
    const question = blocked
      ? "¿Quitar este perfil de tu lista de bloqueos? Su contenido podrá volver a aparecer en tu feed."
      : "¿Ocultar este perfil de tu feed? Esto no impide visitar perfiles públicos ni enviar interacciones."
    if (!window.confirm(question)) return
    lock.current = true
    setBusy(true)
    setMessage("")
    try {
      if (blocked) await desbloquearPerfil(profileId)
      else await bloquearPerfil(profileId)
      setMessage(blocked ? "Perfil retirado de tu lista." : "Perfil añadido a tu lista para ocultarlo del feed.")
      window.dispatchEvent(new Event(PROFILE_BLOCKS_CHANGED))
    } catch {
      setUncertain(true)
      setMessage("No pudimos confirmar el cambio. Consulta de nuevo el estado antes de repetirlo.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <div className="max-w-md space-y-2 text-center text-sm">
    <button type="button" disabled={busy || loading || failed || uncertain} onClick={() => void toggle()}
      className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50">
      {busy ? "Guardando…" : loading ? "Consultando bloqueo…" : blocked ? "Mostrar de nuevo en mi feed" : "Ocultar de mi feed"}
    </button>
    {message && <p role={uncertain ? "alert" : "status"}>{message}</p>}
    {(failed || uncertain) && <div>
      {failed && <p role="alert">No se pudo consultar tu lista de bloqueos.</p>}
      <button type="button" disabled={busy || loading} onClick={() => { setUncertain(false); setMessage(""); reload() }} className="min-h-11 px-3 text-primary underline">Consultar de nuevo</button>
    </div>}
    <p className="text-xs text-muted-foreground">Sólo afecta a lo que ves en tu feed. No restringe el acceso a perfiles públicos ni las interacciones.</p>
    <Link href="/perfil/config#blocked-profiles-heading" className="inline-flex min-h-11 items-center text-primary underline">Administrar mi lista</Link>
  </div>
}

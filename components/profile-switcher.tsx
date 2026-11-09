"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { fetchMyProfiles, getActiveBandId, setActiveBandId, type MyProfileOption } from "@/lib/bands"
import { Loader2, User, Users } from "lucide-react"

const ROLE_LABELS: Record<MyProfileOption["role"], string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
}

/**
 * Switcher "ultra-sencillo" del Punto 4: si el usuario logueado es dueño o
 * miembro de al menos una banda, puede alternar entre su perfil personal y
 * cada banda. Cambiar de selección recarga /dashboard — profile-editor.tsx
 * resuelve el perfil activo (y el rol efectivo) desde cero en cada carga, así
 * que un reload simple es suficiente y evita duplicar esa lógica acá.
 */
export function ProfileSwitcher({ disabled = false, onBeforeReload }: { disabled?: boolean; onBeforeReload?: () => (() => void) }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [options, setOptions] = useState<MyProfileOption[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [retry, setRetry] = useState(0)
  const switchLock = useRef(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!active) return
      if (error) throw error
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)

      const profiles = await fetchMyProfiles(user.id)
      if (!active) return
      setOptions(profiles)

      const personal = profiles.find((p) => !p.isBand)
      const selectedBandId = getActiveBandId(user.id)
      const stillValid = selectedBandId && profiles.some((p) => p.id === selectedBandId)
      setActiveId(stillValid ? selectedBandId! : personal?.id ?? "")
      } catch {
        if (active) setErrorMessage("No pudimos cargar tus perfiles.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [retry])

  // Sin bandas: no hay nada que alternar, no se muestra nada — el panel
  // personal sigue exactamente igual que antes de este cambio.
  if (loading) return <span role="status" className="text-xs text-muted-foreground">Cargando perfiles…</span>
  if (errorMessage) return <div role="alert" className="text-xs text-destructive">
    {errorMessage}
    <button type="button" disabled={disabled} className="ml-2 min-h-11 underline" onClick={() => { setErrorMessage(""); setLoading(true); setRetry(value => value + 1) }}>Reintentar</button>
  </div>
  if (!userId || options.length <= 1) return null

  const handleChange = (id: string) => {
    if (disabled || switchLock.current || id === activeId) return
    const selected = options.find((p) => p.id === id)
    if (!selected || !window.confirm("¿Cambiar de perfil? Se perderán los cambios sin guardar y los archivos locales que todavía no hayas publicado.")) return
    switchLock.current = true
    setSwitching(true)
    let restoreUnloadWarning: (() => void) | undefined
    try {
      setActiveBandId(userId, selected.isBand ? id : null)
      // La confirmación anterior ya autoriza descartar los cambios locales.
      // Evita un segundo aviso que pueda cancelar la recarga después de
      // haber cambiado el perfil seleccionado en el almacenamiento.
      restoreUnloadWarning = onBeforeReload?.()
      setActiveId(id)
      window.location.reload()
    } catch {
      restoreUnloadWarning?.()
      switchLock.current = false
      setSwitching(false)
      setErrorMessage("No pudimos cambiar de perfil. Conserva tus cambios e inténtalo de nuevo.")
    }
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-sidebar-border bg-background/60 px-2 py-1">
      {switching ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
      ) : options.find((p) => p.id === activeId)?.isBand ? (
        <Users className="size-3.5 shrink-0 text-primary" />
      ) : (
        <User className="size-3.5 shrink-0 text-primary" />
      )}
      <select
        value={activeId}
        disabled={switching || disabled}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Cambiar entre tu perfil personal y tus grupos musicales"
        className="bg-transparent text-xs font-medium text-foreground outline-none disabled:cursor-wait disabled:opacity-60"
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName} {p.isBand ? `— ${ROLE_LABELS[p.role]}` : "(Personal)"}
          </option>
        ))}
      </select>
    </div>
  )
}

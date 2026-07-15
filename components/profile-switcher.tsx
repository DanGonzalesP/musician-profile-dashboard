"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { fetchMyProfiles, getActiveBandId, setActiveBandId, type MyProfileOption } from "@/lib/bands"
import { Mic2, Users } from "lucide-react"

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
export function ProfileSwitcher() {
  const [userId, setUserId] = useState<string | null>(null)
  const [options, setOptions] = useState<MyProfileOption[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)

      const profiles = await fetchMyProfiles(user.id)
      setOptions(profiles)

      const personal = profiles.find((p) => !p.isBand)
      const selectedBandId = getActiveBandId(user.id)
      const stillValid = selectedBandId && profiles.some((p) => p.id === selectedBandId)
      setActiveId(stillValid ? selectedBandId! : personal?.id ?? "")
      setLoading(false)
    }
    load()
  }, [])

  // Sin bandas: no hay nada que alternar, no se muestra nada — el panel
  // personal sigue exactamente igual que antes de este cambio.
  if (loading || !userId || options.length <= 1) return null

  const handleChange = (id: string) => {
    setActiveId(id)
    const selected = options.find((p) => p.id === id)
    setActiveBandId(userId, selected?.isBand ? id : null)
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-sidebar-border bg-background/60 px-2 py-1">
      {options.find((p) => p.id === activeId)?.isBand ? (
        <Users className="size-3.5 shrink-0 text-primary" />
      ) : (
        <Mic2 className="size-3.5 shrink-0 text-primary" />
      )}
      <select
        value={activeId}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Cambiar entre tu perfil personal y tus bandas"
        className="bg-transparent text-xs font-medium text-foreground outline-none"
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

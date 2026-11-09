"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { sessionIsDefinitelyInvalid } from "@/lib/auth-session-health"

// Una sesión guardada de una cuenta eliminada o revocada dejaba la app a medias:
// el encabezado mostraba "Mi perfil" y el feed se bloqueaba al no poder leer
// preferencias. Si Auth lo confirma, se cierra SÓLO la sesión local y todos los
// componentes reciben SIGNED_OUT y pasan a modo visitante.
export function SessionGuard() {
  useEffect(() => {
    let active = true
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active || !data.session) return
      const { error } = await supabase.auth.getUser()
      if (active && sessionIsDefinitelyInvalid(error)) await supabase.auth.signOut({ scope: "local" })
    }
    void check().catch(() => {})
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      // Fuera del callback de Auth: no encadenar otra llamada de Auth dentro.
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") queueMicrotask(() => { void check().catch(() => {}) })
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return null
}

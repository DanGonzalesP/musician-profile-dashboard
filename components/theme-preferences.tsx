"use client"

import { useEffect } from "react"
import { accentPreference, applyAccent, applyTheme, themePreference } from "@/lib/theme"

/** Keep document appearance in sync even outside the settings screen. */
export function ThemePreferences() {
  useEffect(() => {
    const syncTheme = () => applyTheme(themePreference.getSnapshot())
    const syncAccent = () => applyAccent(accentPreference.getSnapshot())
    const unsubscribeTheme = themePreference.subscribe(syncTheme)
    const unsubscribeAccent = accentPreference.subscribe(syncAccent)
    syncTheme()
    syncAccent()
    return () => {
      unsubscribeTheme()
      unsubscribeAccent()
    }
  }, [])
  return null
}

"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"
import { type Theme, themePreference, setStoredTheme } from "@/lib/theme"

export function ThemeToggle() {
  const theme = useSyncExternalStore(themePreference.subscribe, themePreference.getSnapshot, themePreference.getServerSnapshot)

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setStoredTheme(next)
  }

  return (
    <div className="flex h-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Modo oscuro / claro</p>
        <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">
          Cómo se ve el panel y tu perfil público en este navegador.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="Modo claro"
        aria-checked={theme === "light"}
        onClick={toggle}
        className={`relative flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${
          theme === "light" ? "bg-primary" : "bg-secondary"
        }`}
      >
        <span
          className={`absolute flex size-6 items-center justify-center rounded-full bg-white text-zinc-900 shadow transition-transform ${
            theme === "light" ? "translate-x-9" : "translate-x-1"
          }`}
        >
          {theme === "light" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </span>
      </button>
    </div>
  )
}

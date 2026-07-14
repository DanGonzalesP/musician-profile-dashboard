"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { type Theme, getStoredTheme, setStoredTheme } from "@/lib/theme"

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    setTheme(getStoredTheme())
  }, [])

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setStoredTheme(next)
    setTheme(next)
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div>
        <p className="text-sm font-medium text-white">Modo Oscuro / Modo Claro</p>
        <p className="text-xs text-zinc-400 mt-0.5 max-w-sm">
          Elige cómo se ve el panel y tu perfil público en tu navegador. El modo oscuro es el predeterminado.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={theme === "light"}
        onClick={toggle}
        className={`relative flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${
          theme === "light" ? "bg-amber-500" : "bg-zinc-700"
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

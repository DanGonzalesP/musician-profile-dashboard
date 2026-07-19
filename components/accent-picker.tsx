"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import {
  ACCENT_OPTIONS,
  type AccentColor,
  getStoredAccent,
  setStoredAccent,
} from "@/lib/theme"

/** Fila de 4 muestras de color — presentacional y controlada. */
export function AccentSwatches({
  value,
  onChange,
}: {
  value: AccentColor
  onChange: (accent: AccentColor) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      {ACCENT_OPTIONS.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            title={option.label}
            className={`relative flex size-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
              selected ? "ring-2 ring-offset-2 ring-offset-card" : ""
            }`}
            style={{
              backgroundColor: option.swatch,
              boxShadow: `0 0 14px ${option.swatch}66`,
              ...(selected ? ({ "--tw-ring-color": option.swatch } as React.CSSProperties) : {}),
            }}
          >
            {selected && <Check className="size-4 text-white drop-shadow" />}
            <span className="sr-only">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tarjeta "color de la plataforma": cambia el acento de TODA la app para
 * este navegador (localStorage, igual que el modo oscuro/claro).
 */
export function AppAccentCard() {
  const [accent, setAccent] = useState<AccentColor>("rojo")

  useEffect(() => {
    setAccent(getStoredAccent())
  }, [])

  const handleChange = (next: AccentColor) => {
    setStoredAccent(next)
    setAccent(next)
  }

  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:col-span-2">
      <div>
        <p className="text-sm font-medium text-foreground">Color de la plataforma</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cambia el acento neón de toda la app en este navegador. Solo lo ves tú.
        </p>
      </div>
      <AccentSwatches value={accent} onChange={handleChange} />
    </div>
  )
}

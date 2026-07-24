"use client"

// Selectores del editor para "Género" y "Año".
//
// GenreSelect: combobox con búsqueda. Muestra todos los géneros conocidos
// (lib/genres), se filtra escribiendo, y al pasar el cursor sobre cada opción
// aparece una descripción de lo que trata el género (title nativo + texto
// bajo la lista). Igual guarda un string suelto — si el artista escribe uno
// que no está en la lista, se respeta tal cual.
//
// YearSelect: desplegable de solo años (no se puede escribir texto libre), así
// nunca queda un "año" con letras u otras cosas inválidas.

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { MUSIC_GENRES, filterGenres } from "@/lib/genres"

// Misma apariencia que el inputClass del inspector, replicado acá para no
// importar desde block-inspector (evita una dependencia circular: ese archivo
// importa estos selectores).
const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"

export function GenreSelect({
  value,
  onChange,
  placeholder = "Busca o elige un género",
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hovered, setHovered] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => filterGenres(query), [query])

  // Cierra al hacer clic fuera del combobox.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onDocDown)
    return () => document.removeEventListener("mousedown", onDocDown)
  }, [open])

  const commit = (genre: string) => {
    onChange(genre)
    setOpen(false)
    setQuery("")
  }

  const hoveredDescription =
    MUSIC_GENRES.find((g) => g.label === hovered)?.description ??
    MUSIC_GENRES.find((g) => g.label === value)?.description ??
    ""

  return (
    <div ref={wrapRef} className="relative">
      {!open ? (
        // Estado cerrado: botón que muestra el valor elegido.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${inputClass} flex items-center justify-between text-left`}
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value || placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        // Estado abierto: buscador + lista desplegable.
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  // Enter con texto: si coincide un género lo usa; si no, guarda
                  // el texto tal cual (género personalizado).
                  commit(results[0]?.label ?? query.trim())
                } else if (e.key === "Escape") {
                  setOpen(false)
                  setQuery("")
                }
              }}
              placeholder={placeholder}
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            <ul className="max-h-56 overflow-y-auto py-1">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Sin coincidencias — presiona Enter para usar “{query.trim()}”.
                </li>
              ) : (
                results.map((g) => (
                  <li key={g.label}>
                    <button
                      type="button"
                      title={g.description}
                      onMouseEnter={() => setHovered(g.label)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => commit(g.label)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                        g.label === value
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="truncate">{g.label}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {/* Descripción del género bajo el cursor (o del seleccionado) — el
                "al pasar el cursor aparece una descripción". */}
            {hoveredDescription && (
              <p className="border-t border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                {hoveredDescription}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Rango de años ofrecidos: desde el año siguiente al actual (para lanzamientos
// programados) hacia atrás hasta 1900.
const CURRENT_YEAR = new Date().getFullYear()
const YEARS: number[] = Array.from({ length: CURRENT_YEAR + 1 - 1900 + 1 }, (_, i) => CURRENT_YEAR + 1 - i)

export function YearSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className="relative">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} appearance-none pr-8 ${!value ? "text-muted-foreground" : ""} ${className ?? ""}`}
      >
        <option value="">Año</option>
        {YEARS.map((y) => (
          <option key={y} value={String(y)} className="text-foreground">
            {y}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { inputClass } from "@/components/block-inspector"

type CountryOption = { isoCode: string; name: string }
type LocationData = {
  countries: CountryOption[]
  State: typeof import("country-state-city").State
}
type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: LocationData }

const countryDisplayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["es"], { type: "region" })
    : null

const PRIORITY_STATE_BY_COUNTRY: Record<string, string> = { PE: "Lima" }

export function LocationSelect({ value, onChange }: {
  value: string
  onChange: (location: string) => void
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  // Sólo el catálogo es estado local. La selección siempre refleja el borrador
  // actual, incluso al cambiar de perfil o recibir una actualización externa.
  useEffect(() => {
    let cancelled = false
    import("country-state-city").then(({ Country, State }) => {
      if (cancelled) return
      const countries = Country.getAllCountries()
        .map(c => ({ isoCode: c.isoCode, name: countryDisplayNames?.of(c.isoCode) ?? c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
      setLoad({ status: "ready", data: { countries, State } })
    }).catch(() => {
      if (!cancelled) setLoad({ status: "error" })
    })
    return () => { cancelled = true }
  }, [attempt])

  const countries = load.status === "ready" ? load.data.countries : []
  const parts = value.split(",").map(part => part.trim()).filter(Boolean)
  const country = countries.find(item => item.name.toLowerCase() === parts.at(-1)?.toLowerCase())
  const countryCode = country?.isoCode ?? ""
  const state = country ? parts.slice(0, -1).join(", ") : ""
  const priority = PRIORITY_STATE_BY_COUNTRY[countryCode]
  const states = load.status === "ready" && countryCode
    ? load.data.State.getStatesOfCountry(countryCode).map(item => item.name).sort((a, b) => {
        if (a === priority) return -1
        if (b === priority) return 1
        return a.localeCompare(b, "es")
      })
    : []

  const unknownLocation = load.status === "ready" && Boolean(value) && !country
  const historicalState = Boolean(state) && !states.includes(state)

  return (
    <div className="space-y-2">
      {load.status === "error" && (
        <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs">
          <p>No pudimos cargar los países. Tu ubicación guardada se conserva.</p>
          <button type="button" className="min-h-11 px-2 font-medium underline"
            onClick={() => { setLoad({ status: "loading" }); setAttempt(current => current + 1) }}>
            Reintentar carga
          </button>
        </div>
      )}
      {(unknownLocation || (load.status !== "ready" && value)) && (
        <p className="break-words text-xs text-muted-foreground">
          Ubicación guardada: {value}. Se conserva hasta que elijas otra.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <select value={countryCode}
          onChange={event => onChange(countries.find(item => item.isoCode === event.target.value)?.name ?? "")}
          disabled={load.status !== "ready"} aria-label="País" className={`${inputClass} min-h-11`}>
          <option value="">{load.status === "loading" ? "Cargando países…" : "País"}</option>
          {countries.map(item => <option key={item.isoCode} value={item.isoCode}>{item.name}</option>)}
        </select>
        <select value={state}
          onChange={event => {
            if (!country) return
            onChange(event.target.value ? `${event.target.value}, ${country.name}` : country.name)
          }}
          disabled={!country || load.status !== "ready"} aria-label="Departamento" className={`${inputClass} min-h-11`}>
          <option value="">{!country ? "Elige un país primero" : "Departamento"}</option>
          {historicalState && <option value={state}>{state} (guardado)</option>}
          {states.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
    </div>
  )
}

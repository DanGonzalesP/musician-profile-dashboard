"use client"

// Selector de ubicación — país + departamento (estado/provincia), ambos
// elegidos de una lista desplegable (ya no texto libre, y ya no ciudad: el
// dataset de ciudades de country-state-city es demasiado granular/ruidoso
// para este campo, un departamento alcanza). El dataset (country-state-city)
// se carga de forma diferida (import dinámico) para no engordar el bundle
// principal del editor; los nombres de país se muestran en español vía
// Intl.DisplayNames, que es nativo del navegador y no requiere traducir
// a mano los 250 países del dataset.

import { useEffect, useState } from "react"
import { inputClass } from "@/components/block-inspector"

type CountryOption = { isoCode: string; name: string }

const countryDisplayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["es"], { type: "region" })
    : null

// Perú es, por ahora, el único país con un orden especial: Lima va primero
// (capital, donde vive la enorme mayoría de artistas de la plataforma) y el
// resto de departamentos queda alfabético detrás — sin esto, "Amazonas"
// salía antes que "Lima" solo por orden alfabético, forzando scroll extra al
// caso más común.
const PRIORITY_STATE_BY_COUNTRY: Record<string, string> = {
  PE: "Lima",
}

export function LocationSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (location: string) => void
}) {
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [states, setStates] = useState<string[]>([])
  const [countryCode, setCountryCode] = useState("")
  const [state, setState] = useState("")
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingStates, setLoadingStates] = useState(false)

  // Carga la lista de países una sola vez, e intenta emparejar el valor
  // guardado (que puede venir de un borrador antiguo escrito a mano) contra
  // un país conocido para no perder la ubicación ya cargada.
  useEffect(() => {
    let cancelled = false
    import("country-state-city").then(({ Country }) => {
      if (cancelled) return
      const list = Country.getAllCountries()
        .map((c) => ({ isoCode: c.isoCode, name: countryDisplayNames?.of(c.isoCode) ?? c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
      setCountries(list)
      setLoadingCountries(false)

      if (value) {
        const parts = value.split(",").map((p) => p.trim()).filter(Boolean)
        const guessCountryName = parts[parts.length - 1]?.toLowerCase()
        const match = list.find((c) => c.name.toLowerCase() === guessCountryName)
        if (match) {
          setCountryCode(match.isoCode)
          if (parts.length > 1) setState(parts[0])
        }
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carga los departamentos/estados del país elegido cada vez que cambia.
  useEffect(() => {
    if (!countryCode) {
      setStates([])
      return
    }
    let cancelled = false
    setLoadingStates(true)
    import("country-state-city").then(({ State }) => {
      if (cancelled) return
      const priority = PRIORITY_STATE_BY_COUNTRY[countryCode]
      const list = (State.getStatesOfCountry(countryCode) ?? [])
        .map((s) => s.name)
        .sort((a, b) => {
          if (priority) {
            if (a === priority) return -1
            if (b === priority) return 1
          }
          return a.localeCompare(b, "es")
        })
      setStates(list)
      setLoadingStates(false)
    })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  function handleCountryChange(iso: string) {
    setCountryCode(iso)
    setState("")
    const countryName = countries.find((c) => c.isoCode === iso)?.name ?? ""
    onChange(countryName)
  }

  function handleStateChange(stateName: string) {
    setState(stateName)
    const countryName = countries.find((c) => c.isoCode === countryCode)?.name ?? ""
    onChange(stateName && countryName ? `${stateName}, ${countryName}` : countryName)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={countryCode}
        onChange={(e) => handleCountryChange(e.target.value)}
        disabled={loadingCountries}
        className={inputClass}
      >
        <option value="">{loadingCountries ? "Cargando países…" : "País"}</option>
        {countries.map((c) => (
          <option key={c.isoCode} value={c.isoCode}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={state}
        onChange={(e) => handleStateChange(e.target.value)}
        disabled={!countryCode || loadingStates}
        className={inputClass}
      >
        <option value="">
          {!countryCode ? "Elige un país primero" : loadingStates ? "Cargando departamentos…" : "Departamento"}
        </option>
        {states.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

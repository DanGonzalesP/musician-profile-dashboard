"use client"

// Selector de ubicación — país + ciudad, ambos elegidos de una lista
// desplegable (ya no texto libre). El dataset de país/ciudad (country-state-city)
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

export function LocationSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (location: string) => void
}) {
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [countryCode, setCountryCode] = useState("")
  const [city, setCity] = useState("")
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingCities, setLoadingCities] = useState(false)

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
          if (parts.length > 1) setCity(parts[0])
        }
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carga las ciudades del país elegido cada vez que cambia.
  useEffect(() => {
    if (!countryCode) {
      setCities([])
      return
    }
    let cancelled = false
    setLoadingCities(true)
    import("country-state-city").then(({ City }) => {
      if (cancelled) return
      const list = (City.getCitiesOfCountry(countryCode) ?? [])
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b, "es"))
      setCities(list)
      setLoadingCities(false)
    })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  function handleCountryChange(iso: string) {
    setCountryCode(iso)
    setCity("")
    const countryName = countries.find((c) => c.isoCode === iso)?.name ?? ""
    onChange(countryName)
  }

  function handleCityChange(cityName: string) {
    setCity(cityName)
    const countryName = countries.find((c) => c.isoCode === countryCode)?.name ?? ""
    onChange(cityName && countryName ? `${cityName}, ${countryName}` : countryName)
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
        value={city}
        onChange={(e) => handleCityChange(e.target.value)}
        disabled={!countryCode || loadingCities}
        className={inputClass}
      >
        <option value="">{!countryCode ? "Elige un país primero" : loadingCities ? "Cargando ciudades…" : "Ciudad"}</option>
        {cities.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

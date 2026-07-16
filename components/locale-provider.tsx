"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { type Locale, translate } from "@/lib/i18n"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

const LOCALE_STORAGE_KEY = "amplitude:locale"

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es")

  // El default de servidor/primer render siempre es "es" (para que no haya
  // desajuste de hidratación); una vez montado en el cliente, se lee la
  // preferencia guardada y se aplica.
  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === "es" || stored === "en") setLocaleState(stored)
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/**
 * LocaleProvider ahora envuelve toda la app desde app/layout.tsx, así que en
 * la práctica siempre hay contexto disponible. Este fallback a español fijo
 * se mantiene solo por seguridad para cualquier render aislado (tests,
 * storybook, etc.) que no pase por el layout raíz.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    return { locale: "es", setLocale: () => {}, t: (key, vars) => translate("es", key, vars) }
  }
  return ctx
}

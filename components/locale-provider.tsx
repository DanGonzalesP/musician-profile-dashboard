"use client"

import { createContext, useContext, useMemo, useSyncExternalStore } from "react"
import { type Locale, translate } from "@/lib/i18n"
import { createBrowserPreference } from "@/lib/browser-preference"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

const LOCALE_STORAGE_KEY = "amplitude:locale"
const localePreference = createBrowserPreference<Locale>(
  LOCALE_STORAGE_KEY, "es", (value): value is Locale => value === "es" || value === "en",
)
const setLocale = localePreference.set

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // The server snapshot also supplies the first hydration render.
  const locale = useSyncExternalStore(localePreference.subscribe, localePreference.getSnapshot, localePreference.getServerSnapshot)

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

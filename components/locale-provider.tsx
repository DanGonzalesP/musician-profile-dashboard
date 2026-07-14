"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { type Locale, translate } from "@/lib/i18n"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("es")

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
 * Fuera de LocaleProvider (ej. dentro del Dashboard/editor o /perfil/preview)
 * cae a español fijo — el selector de idioma solo vive en la vista pública,
 * así que los mismos componentes de bloque siguen funcionando sin cambios
 * ahí donde no hay proveedor.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    return { locale: "es", setLocale: () => {}, t: (key, vars) => translate("es", key, vars) }
  }
  return ctx
}

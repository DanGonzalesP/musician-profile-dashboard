"use client"

import { useLocale } from "./locale-provider"

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card/70 p-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
      {(["es", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors ${
            locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

import { createBrowserPreference } from "@/lib/browser-preference"

export type Theme = "dark" | "light"

export const THEME_STORAGE_KEY = "amplitude-theme"

// ─── Acento de color ───────────────────────────────────────────────────────
// La plataforma es rojo neón por defecto, pero cada usuario puede elegir
// otro acento eléctrico para SU navegador (se guarda en localStorage y se
// aplica como clase en <html>) y, por separado, el acento de su PERFIL
// público (profiles.accent_color — lo ven todos sus visitantes, aplicado
// como clase en el contenedor de la página del perfil).

export type AccentColor = "rojo" | "morado" | "azul" | "verde"

export const ACCENT_STORAGE_KEY = "amplitude-accent"

export const ACCENT_OPTIONS: { id: AccentColor; label: string; swatch: string; className: string }[] = [
  { id: "rojo", label: "Rojo neón", swatch: "#ff2440", className: "" },
  { id: "morado", label: "Morado eléctrico", swatch: "#a855f7", className: "accent-morado" },
  { id: "azul", label: "Azul eléctrico", swatch: "#3b82f6", className: "accent-azul" },
  { id: "verde", label: "Verde neón", swatch: "#22c55e", className: "accent-verde" },
]

const ACCENT_CLASSES = ACCENT_OPTIONS.map((a) => a.className).filter(Boolean)

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_OPTIONS.some((a) => a.id === value)
}

export function accentClassName(accent: AccentColor | null | undefined): string {
  return ACCENT_OPTIONS.find((a) => a.id === accent)?.className ?? ""
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light")
}

export function getStoredTheme(): Theme {
  return themePreference.getSnapshot()
}

export function setStoredTheme(theme: Theme) {
  themePreference.set(theme)
  applyTheme(theme)
}

export function applyAccent(accent: AccentColor) {
  const el = document.documentElement
  el.classList.remove(...ACCENT_CLASSES)
  const cls = accentClassName(accent)
  if (cls) el.classList.add(cls)
}

export function getStoredAccent(): AccentColor {
  return accentPreference.getSnapshot()
}

export function setStoredAccent(accent: AccentColor) {
  accentPreference.set(accent)
  applyAccent(accent)
}

export const themePreference = createBrowserPreference<Theme>(
  THEME_STORAGE_KEY, "dark", (value): value is Theme => value === "dark" || value === "light",
)
export const accentPreference = createBrowserPreference<AccentColor>(
  ACCENT_STORAGE_KEY, "rojo", isAccentColor,
)

export type Theme = "dark" | "light"

export const THEME_STORAGE_KEY = "amplitude-theme"

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light")
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"
}

export function setStoredTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}

import Script from "next/script"

// Script bloqueante en <head>: corre antes de la hidratación para evitar un
// parpadeo de tema incorrecto (FOUC). La clave debe coincidir con
// THEME_STORAGE_KEY en lib/theme.ts — no se puede importar el módulo TS
// directamente dentro de un script inline. Usa next/script con
// beforeInteractive, la estrategia oficial de Next.js para este caso.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (window.localStorage.getItem("amplitude-theme") === "light") {
      document.documentElement.classList.add("light");
    }
  } catch (e) {}
})();
`

export function ThemeScript() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {THEME_INIT_SCRIPT}
    </Script>
  )
}

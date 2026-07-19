import Script from "next/script"

// Script bloqueante en <head>: corre antes de la hidratación para evitar un
// parpadeo de tema/acento incorrecto (FOUC). Las claves deben coincidir con
// THEME_STORAGE_KEY y ACCENT_STORAGE_KEY en lib/theme.ts — no se puede
// importar el módulo TS directamente dentro de un script inline. Usa
// next/script con beforeInteractive, la estrategia oficial de Next.js.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (window.localStorage.getItem("amplitude-theme") === "light") {
      document.documentElement.classList.add("light");
    }
    var accent = window.localStorage.getItem("amplitude-accent");
    var accentClasses = { morado: "accent-morado", azul: "accent-azul", verde: "accent-verde" };
    if (accent && accentClasses[accent]) {
      document.documentElement.classList.add(accentClasses[accent]);
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

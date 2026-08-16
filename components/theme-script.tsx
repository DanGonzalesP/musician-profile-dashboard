// Script bloqueante en <head>: corre antes de la hidratación para evitar un
// parpadeo de tema/acento incorrecto (FOUC). Las claves deben coincidir con
// THEME_STORAGE_KEY y ACCENT_STORAGE_KEY en lib/theme.ts — no se puede
// importar el módulo TS directamente dentro de un script inline.
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

export function ThemeScript({ nonce }: { nonce?: string }) {
  return (
    <script
      id="theme-init"
      nonce={nonce}
      // El navegador oculta deliberadamente el atributo content `nonce` al
      // DOM después de procesarlo. React vería `nonce=""` al hidratar aunque
      // el valor correcto sí se usó, por eso se suprime únicamente esta
      // diferencia conocida y acotada.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  )
}

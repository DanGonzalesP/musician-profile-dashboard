import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescript from "eslint-config-next/typescript"

// El package.json declaraba "lint": "eslint ." pero ESLint no estaba
// instalado ni configurado: el script fallaba siempre y nadie lo notaba.
//
// Se usa el flat config nativo de eslint-config-next 16 (no FlatCompat, que
// no es compatible con ESLint 10).

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/ffmpeg/**",
      "next-env.d.ts",
      ".claude/**",
    ],
  },
  {
    rules: {
      // El proyecto usa `any` en puntos concretos donde el tipo real viene de
      // un JSONB sin esquema. Se avisa, no se bloquea: convertirlo en error
      // hoy solo generaría ruido que nadie va a leer.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Las imágenes salen de R2 con dimensiones variables y next/image está
      // desactivado a propósito (images.unoptimized). La regla no aplica.
      "@next/next/no-img-element": "off",

      // ── Reglas del React Compiler ──────────────────────────────────────
      // Estas marcan patrones que perjudican el rendimiento (renders en
      // cascada por setState dentro de un efecto, refs leídas durante el
      // render). Son señalamientos legítimos, pero corregirlos bien son ~23
      // refactors de hooks repartidos por todo el editor: es un trabajo
      // aparte, no algo para colar dentro de una tanda de seguridad.
      //
      // Quedan como warning A PROPÓSITO: un CI en rojo que nadie puede
      // arreglar hoy se vuelve ruido y termina ignorándose, y con él se
      // ignoran también los errores que sí importan. Los casos que SÍ eran
      // bugs de verdad (un componente recreado en cada render que rompía el
      // arrastrar-y-soltar, una función usada antes de declararse) ya están
      // corregidos.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",

      // Texto en español con apóstrofos y comillas: escaparlos en JSX
      // ensuciaría el contenido sin que el usuario note diferencia.
      "react/no-unescaped-entities": "off",
    },
  },
]

export default config

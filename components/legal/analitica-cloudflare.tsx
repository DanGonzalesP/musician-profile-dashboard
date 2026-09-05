"use client"

import { useEffect } from "react"

// Analítica de Cloudflare Web Analytics — el reemplazo de `@vercel/analytics`
// en la migración a Cloudflare.
//
// Se mantiene la propiedad que hacía verdadera a `/legal/cookies`: esto NO se
// monta solo. Sólo lo monta `ConsentimientoCookies` tras un sí explícito, y
// sólo en producción. Ver el comentario largo de ese archivo.
//
// Por qué se inyecta el <script> a mano en vez de renderizarlo como JSX:
//
//   • **La CSP.** `script-src` lleva `'strict-dynamic'`, que hace que los
//     navegadores IGNOREN la lista de hosts permitidos y confíen únicamente en
//     la cadena de origen: un script insertado por código ya confiable hereda
//     esa confianza. Un `<script src>` creado con `document.createElement`
//     desde el bundle de React —que sí carga con nonce— entra por esa puerta
//     sin ambigüedad. Renderizarlo como JSX dependería de cómo React decida
//     materializar el nodo, que no es una garantía sobre la que convenga
//     apoyar una política de seguridad.
//
//   • **Sin token no se carga nada.** Fail-closed, igual que el resto de la
//     configuración del proyecto: si `NEXT_PUBLIC_CF_BEACON_TOKEN` falta, esto
//     no inserta ningún script ni abre ninguna conexión, en vez de cargar el
//     beacon con un token vacío y ensuciar la consola del visitante.
//
// El token de Cloudflare Web Analytics es público por diseño —viaja en el HTML
// de todas las páginas—, por eso es `NEXT_PUBLIC_`. No autoriza a leer nada:
// sólo identifica el sitio al que se le atribuyen las visitas.

const ORIGEN_BEACON = "https://static.cloudflareinsights.com/beacon.min.js"

export function AnaliticaCloudflare() {
  const token = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN

  useEffect(() => {
    if (!token) return
    // Si el visitante acepta, se va y vuelve a aceptar dentro de la misma
    // navegación, no debe haber dos beacons contando la misma visita.
    if (document.querySelector(`script[src="${ORIGEN_BEACON}"]`)) return

    const script = document.createElement("script")
    script.src = ORIGEN_BEACON
    script.defer = true
    script.setAttribute("data-cf-beacon", JSON.stringify({ token }))
    document.head.appendChild(script)

    // A propósito NO se retira el script al desmontar. Cloudflare Web
    // Analytics registra la visita al cargar; quitar la etiqueta después no
    // borra nada y volver a insertarla en el siguiente montaje contaría doble.
    // La retirada real del consentimiento es la recarga que ya provoca el
    // aviso al cambiar de decisión.
  }, [token])

  return null
}

"use client"

import { useCallback, useSyncExternalStore } from "react"
import Link from "next/link"
import { AnaliticaCloudflare } from "./analitica-cloudflare"
import {
  EVENTO_CONSENTIMIENTO,
  debePreguntar,
  guardarDecision,
  leerDecision,
  permiteAnalitica,
  type DecisionCookies,
} from "@/lib/consentimiento-cookies"

// Consentimiento de analítica (P-31 · F14).
//
// Antes, `app/layout.tsx` montaba la analítica en producción sin preguntar,
// mientras `/legal/cookies` afirmaba que Vibe no usa rastreadores. Este
// componente es lo que hace verdadera esa página: la analítica **sólo** se
// monta tras un sí explícito.
//
// El proveedor cambió de Vercel a Cloudflare Web Analytics con la migración,
// pero la promesa al visitante no: sigue sin publicidad, sin rastreo entre
// sitios y sin cargarse hasta que alguien dice que sí. Ver
// `analitica-cloudflare.tsx`.
//
// Tres decisiones de diseño que importan:
//
//   • **Fail-closed.** Sin decisión guardada no se carga nada, y un valor
//     manipulado a mano cuenta como "sin decidir" (ver `normalizarDecision`).
//
//   • **Nada en el HTML del servidor.** La decisión vive en el navegador de
//     cada visitante, así que el servidor no puede saberla. Se usa
//     `useSyncExternalStore` con un `getServerSnapshot` que devuelve el
//     centinela `"servidor"`: el HTML sale sin aviso, la hidratación coincide
//     exactamente con él, y recién después React lee el almacenamiento real.
//     Sin esto, o el aviso aparecería en el HTML de todos —incluidos quienes
//     ya respondieron—, o habría un desajuste de hidratación.
//
//     (Se prefiere `useSyncExternalStore` a `useEffect` + `useState` a
//     propósito: llamar a `setState` dentro de un efecto es justo lo que marca
//     el React Compiler, y el trinquete de lint de `AGENTS.md` no admite un
//     warning nuevo.)
//
//   • **No es un modal.** No atrapa el foco, no bloquea la página y no lleva
//     `role="dialog"`: es un aviso al pie que se puede ignorar, recorrer con
//     Tab y cerrar con cualquiera de sus dos botones. Un muro de consentimiento
//     sobre el perfil público de un artista sería peor producto y peor
//     accesibilidad.

/** Lo que devuelve el servidor: "todavía no se sabe, no pintes nada". */
type Instantanea = DecisionCookies | "servidor"

function suscribir(alCambiar: () => void): () => void {
  // `storage` cubre las OTRAS pestañas; el evento propio, ésta.
  window.addEventListener(EVENTO_CONSENTIMIENTO, alCambiar)
  window.addEventListener("storage", alCambiar)
  return () => {
    window.removeEventListener(EVENTO_CONSENTIMIENTO, alCambiar)
    window.removeEventListener("storage", alCambiar)
  }
}

// Devuelven cadenas, así que React las compara por valor: no hace falta
// memorizar nada para evitar renders en bucle.
const instantaneaCliente = (): Instantanea => leerDecision()
const instantaneaServidor = (): Instantanea => "servidor"

export function ConsentimientoCookies() {
  const decision = useSyncExternalStore(suscribir, instantaneaCliente, instantaneaServidor)

  const responder = useCallback((valor: "aceptado" | "rechazado") => {
    // `guardarDecision` emite el evento al que está suscrito el store, así que
    // la interfaz se actualiza sola: no hay estado duplicado que sincronizar.
    guardarDecision(valor)
  }, [])

  if (decision === "servidor") return null

  // En desarrollo y en las pruebas la analítica no se carga nunca, ni siquiera
  // aceptada: es la misma condición que tenía `app/layout.tsx` y evita ensuciar
  // las métricas reales con tráfico local.
  const analitica =
    process.env.NODE_ENV === "production" && permiteAnalitica(decision) ? <AnaliticaCloudflare /> : null

  if (!debePreguntar(decision)) return analitica

  return (
    <>
      {analitica}
      <div
        role="region"
        aria-label="Consentimiento de analítica"
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 p-4 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Usamos métricas de uso anónimas y agregadas para saber qué partes de Vibe se usan. No hay
            publicidad ni rastreo entre sitios. Puedes decir que no y la plataforma funciona igual.{" "}
            <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
              Leer la política de cookies
            </Link>
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => responder("rechazado")}
              className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary"
            >
              Solo lo necesario
            </button>
            <button
              type="button"
              onClick={() => responder("aceptado")}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Aceptar métricas
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

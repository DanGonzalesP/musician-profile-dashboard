"use client"

import { useEffect } from "react"
import Link from "next/link"

// Límite de error global. Sin este archivo, cualquier excepción no capturada
// durante el render mostraba la pantalla genérica de Next.js — que en
// producción es una página en blanco con "Application error".

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Punto único donde enganchar el reporte de errores (Sentry) cuando se
    // configure. Por ahora al menos queda en la consola del navegador con el
    // digest, que es lo que permite cruzarlo con los logs del servidor.
    console.error("[error-boundary]", error.digest ?? "", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Algo se rompió de nuestro lado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          No es culpa tuya. Puedes reintentar; si vuelve a pasar, vuelve al feed y prueba de nuevo
          en un rato.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground/70">
            Código de referencia: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/40"
        >
          Ir al feed
        </Link>
      </div>
    </div>
  )
}

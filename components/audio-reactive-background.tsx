"use client"

import { useEffect, useRef } from "react"
import { subscribeAudioLevel } from "@/lib/audio-bus"

/**
 * Fondo fijo detrás de todo el contenido: degradado rojo oscuro que se
 * desvanece hacia el negro, con un resplandor central cuya opacidad y
 * escala laten con el nivel de audio en tiempo real (vía CSS var
 * --audio-level, actualizada fuera de React para no re-renderizar en cada
 * frame). Si no hay audio sonando, --audio-level se mantiene en 0 y el
 * resplandor queda en su tamaño/opacidad base.
 */
export function AudioReactiveBackground() {
  const glowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return subscribeAudioLevel((level) => {
      const el = glowRef.current
      if (!el) return
      const eased = Math.min(1, level * 1.6)
      el.style.setProperty("--audio-level", eased.toFixed(3))
    })
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <div
        ref={glowRef}
        className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] rounded-full blur-[120px]"
        style={
          {
            "--audio-level": 0,
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 55%, transparent) 0%, transparent 65%)",
            opacity: "calc(0.25 + var(--audio-level, 0) * 0.5)",
            transform: "translate(-50%, -50%) scale(calc(0.85 + var(--audio-level, 0) * 0.25))",
          } as React.CSSProperties
        }
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black" />
    </div>
  )
}

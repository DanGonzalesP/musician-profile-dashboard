"use client"

// Carrusel de auto-scroll infinito. El contenido se desplaza solo y en loop
// sin fin: lo que sale por un extremo reaparece por el otro. Funciona en los
// dos ejes ("x" horizontal, "y" vertical).
//
// Cómo logra el loop sin costuras: renderiza los hijos DOS veces (el segundo
// juego es aria-hidden). Un requestAnimationFrame va sumando scrollLeft/Top y,
// al pasar la mitad del contenido (que es exactamente un juego completo),
// resta esa mitad — como el segundo juego es idéntico al primero, el salto es
// invisible. Como usa scroll nativo (no transform), el usuario puede además
// deslizar/arrastrar/scrollear con el dedo o la rueda en cualquier momento; el
// auto-scroll se pausa mientras interactúa o pasa el mouse por encima y se
// reanuda solo. Respeta prefers-reduced-motion.

import { useEffect, useRef, type ReactNode } from "react"

export function AutoScrollCarousel({
  axis = "x",
  speed = 0.35,
  paused = false,
  className = "",
  innerClassName = "",
  ariaLabel,
  children,
}: {
  axis?: "x" | "y"
  /** px por frame (~60fps). 0.35 ≈ lento y elegante. */
  speed?: number
  /** Pausa forzada desde afuera (ej. cuando una tarjeta está expandida). */
  paused?: boolean
  /** Clases del contenedor scrolleable (overflow, tamaño, etc.). */
  className?: string
  /** Clases del track interno (flex-row/flex-col, gap...). Se aplica a cada juego. */
  innerClassName?: string
  ariaLabel?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(false)
  const externalPausedRef = useRef(paused)
  const resumeTimer = useRef<number | null>(null)

  const isY = axis === "y"

  useEffect(() => {
    externalPausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (pausedRef.current || externalPausedRef.current) return
      const half = (isY ? el.scrollHeight : el.scrollWidth) / 2
      if (half <= 1) return
      if (isY) {
        el.scrollTop += speed
        if (el.scrollTop >= half) el.scrollTop -= half
      } else {
        el.scrollLeft += speed
        if (el.scrollLeft >= half) el.scrollLeft -= half
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isY, speed])

  // Mantiene el loop también cuando el usuario scrollea a mano: al cruzar la
  // mitad se reajusta para que nunca choque contra un borde duro.
  const handleScroll = () => {
    const el = ref.current
    if (!el) return
    const half = (isY ? el.scrollHeight : el.scrollWidth) / 2
    if (half <= 1) return
    const pos = isY ? el.scrollTop : el.scrollLeft
    if (pos >= half) {
      if (isY) el.scrollTop = pos - half
      else el.scrollLeft = pos - half
    }
  }

  const pause = () => {
    pausedRef.current = true
    if (resumeTimer.current) {
      window.clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
  }
  const resume = () => {
    pausedRef.current = false
  }
  // Tras deslizar/rueda: pausa breve y reanuda solo.
  const nudge = () => {
    pausedRef.current = true
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false
    }, 1600)
  }

  return (
    <div
      ref={ref}
      role="list"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onPointerDown={pause}
      onPointerUp={resume}
      onTouchStart={pause}
      onTouchEnd={nudge}
      onWheel={nudge}
      style={{ scrollbarWidth: "none" }}
      className={`${isY ? "overflow-y-auto" : "overflow-x-auto"} [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {/* Envoltorio SIN gap propio que ubica los dos juegos uno junto al otro
          en el eje del carrusel (fila para "x", columna para "y"). Sin este
          `flex` explícito, dos <div> son bloques y se APILAN VERTICALMENTE
          por default — eso rompía el carrusel horizontal (se veía como una
          grilla de 2 filas en vez de una sola fila continua). El gap entre
          juegos debe ser CERO (no llevarlo acá) para que la mitad exacta del
          scroll coincida con el final del primer juego. */}
      <div className={isY ? "flex flex-col" : "flex flex-row"}>
        <div className={innerClassName}>{children}</div>
        <div className={innerClassName} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}

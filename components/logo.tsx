"use client"

import { cn } from "@/lib/utils"

/**
 * Marca de vibra — logotipo de UNA sola palabra, sin ícono adosado.
 * La palabra completa "vibra" se escribe en el display de la casa con un
 * degradado que termina en el color primario (la marca "se enciende" hacia
 * el final), y debajo lleva su firma sonora: un pulso de ecualizador de
 * cinco barras que hace de subrayado. Ese pulso es el mismo que usa
 * `LogoMark` (favicon, sellos cuadrados), así toda la identidad sale de un
 * único gesto: la música como latido de la palabra.
 */

function PulseUnderline({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 12"
      className={cn("h-[0.32em] w-auto text-primary", className)}
      style={{ filter: "drop-shadow(0 0 6px color-mix(in oklch, var(--primary) 65%, transparent))" }}
      fill="currentColor"
    >
      <rect x="0" y="4" width="4" height="4" rx="2" />
      <rect x="8" y="1" width="4" height="10" rx="2" />
      <rect x="16" y="3" width="4" height="6" rx="2" />
      <rect x="24" y="0" width="4" height="12" rx="2" />
      <rect x="32" y="4" width="4" height="4" rx="2" />
      <rect x="40" y="2" width="4" height="8" rx="2" />
      <rect x="48" y="5" width="4" height="2" rx="1" />
      <rect x="56" y="3" width="4" height="6" rx="2" />
    </svg>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black",
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="size-[70%]" fill="currentColor">
        {/* La "v" de vibra con su pulso de ecualizador debajo */}
        <text
          x="50"
          y="56"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-display, inherit)"
          fontWeight="800"
          fontSize="62"
          className="text-white"
          fill="currentColor"
        >
          v
        </text>
        <g className="text-primary">
          <rect x="22" y="82" width="7" height="8" rx="3.5" />
          <rect x="34" y="76" width="7" height="14" rx="3.5" />
          <rect x="46" y="80" width="7" height="10" rx="3.5" />
          <rect x="58" y="72" width="7" height="18" rx="3.5" />
          <rect x="70" y="79" width="7" height="11" rx="3.5" />
        </g>
      </svg>
    </span>
  )
}

export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string
  markClassName?: string
  showWordmark?: boolean
}) {
  if (!showWordmark) {
    return <LogoMark className={cn("size-8", markClassName)} />
  }

  return (
    <span className={cn("inline-flex flex-col items-start leading-none", className)}>
      <span className="bg-gradient-to-r from-foreground from-40% to-primary bg-clip-text font-display text-xl font-extrabold tracking-tight text-transparent">
        vibra
      </span>
      <PulseUnderline className={cn("mt-0.5 ml-0.5", markClassName)} />
    </span>
  )
}

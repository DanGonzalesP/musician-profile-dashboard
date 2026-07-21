"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Marca de Vibe — logotipo de UNA sola palabra, sin ícono adosado.
 * La palabra completa "Vibe" se escribe en el display de la casa con un
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

/**
 * La "V" de Vibe ya no es una letra de molde con una raya de color debajo
 * (leía como "V subrayada"): ahora la propia v está construida con las
 * barras del pulso de ecualizador, de más altas en los extremos a la más
 * corta en el centro — a la vez una v y una onda de sonido, un solo gesto
 * en vez de letra + adorno.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Ir al feed principal"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 0%, color-mix(in oklch, var(--primary) 35%, transparent), transparent 70%)",
        }}
      />
      <svg viewBox="0 0 100 100" className="relative size-[68%]">
        <defs>
          <linearGradient id="vibraMarkGradient" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="38%" stopColor="#fff" />
            <stop offset="50%" style={{ stopColor: "var(--primary)" }} />
            <stop offset="62%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
        </defs>
        <g fill="url(#vibraMarkGradient)" style={{ filter: "drop-shadow(0 0 5px color-mix(in oklch, var(--primary) 55%, transparent))" }}>
          <rect x="6" y="22" width="9" height="60" rx="4.5" />
          <rect x="19.5" y="36" width="9" height="46" rx="4.5" />
          <rect x="33" y="50" width="9" height="32" rx="4.5" />
          <rect x="45.5" y="62" width="9" height="20" rx="4.5" />
          <rect x="58" y="50" width="9" height="32" rx="4.5" />
          <rect x="71.5" y="36" width="9" height="46" rx="4.5" />
          <rect x="85" y="22" width="9" height="60" rx="4.5" />
        </g>
      </svg>
    </Link>
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
    <Link
      href="/"
      aria-label="Ir al feed principal"
      className={cn("inline-flex flex-col items-start leading-none", className)}
    >
      <span className="bg-gradient-to-r from-foreground from-40% to-primary bg-clip-text font-display text-xl font-extrabold tracking-tight text-transparent">
        Vibe
      </span>
      <PulseUnderline className={cn("mt-0.5 ml-0.5", markClassName)} />
    </Link>
  )
}

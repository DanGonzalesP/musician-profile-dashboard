"use client"

import { cn } from "@/lib/utils"

/**
 * Marca de Décima. La "d" minúscula de "décima" se reemplaza por una
 * corchea (nota musical ♪) dibujada a mano: la plica hace de asta de la
 * "d", el óvalo inclinado hace de bowl, y la bandera es lo que la vuelve
 * nota. `LogoMark` es el sello cuadrado (favicon, íconos standalone);
 * `Logo` es el logotipo completo, donde la corchea se dibuja directo junto
 * a "écima" — un solo trazo, sin caja de por medio — para que se lean como
 * una sola palabra y no como ícono + texto.
 */

function NoteGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 60"
      className={cn("h-[1.3em] w-auto shrink-0 self-end text-primary", className)}
      style={{ filter: "drop-shadow(0 0 8px color-mix(in oklch, var(--primary) 60%, transparent))" }}
      fill="currentColor"
    >
      <rect x="22" y="2" width="8" height="48" rx="4" />
      <ellipse cx="14" cy="48" rx="13" ry="10" transform="rotate(-15 14 48)" />
      <path d="M30,2 C43,5 48,17 44,28 C41,21 35,15 30,17 Z" />
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
      <svg viewBox="0 0 100 100" className="size-[72%]" fill="none">
        <rect x="56" y="16" width="9" height="58" rx="4.5" fill="currentColor" className="text-primary" />
        <ellipse cx="46" cy="76" rx="18" ry="13" transform="rotate(-20 46 76)" fill="currentColor" className="text-primary" />
        <path d="M65,16 C82,20 90,34 84,48 C81,38 74,30 65,32 Z" fill="currentColor" className="text-primary" />
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
    <span className={cn("inline-flex items-end gap-0.5", className)}>
      <NoteGlyph className={markClassName} />
      <span className="font-display text-lg font-semibold leading-none tracking-tight text-foreground">
        écima
      </span>
    </span>
  )
}

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
      viewBox="0 0 44 60"
      className={cn("h-[1.55em] w-auto shrink-0 self-end text-primary", className)}
      style={{ filter: "drop-shadow(0 0 8px color-mix(in oklch, var(--primary) 60%, transparent))" }}
      fill="currentColor"
    >
      <rect x="25" y="2" width="8" height="48" rx="4" />
      <ellipse cx="15" cy="48" rx="14" ry="11" transform="rotate(-8 15 48)" />
      <path d="M33,2 C42,5 44,15 41,25 C38,19 34,14 33,15 Z" />
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
    <span className={cn("inline-flex items-end", className)}>
      <NoteGlyph className={cn("-mr-1", markClassName)} />
      <span className="font-display text-lg font-semibold leading-none tracking-tight text-foreground">
        écima
      </span>
    </span>
  )
}

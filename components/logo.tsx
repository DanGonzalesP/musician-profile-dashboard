"use client"

import { cn } from "@/lib/utils"

/**
 * Marca de Décima. La "d" minúscula de "décima" se reemplaza por una
 * corchea (nota musical ♪) — mismo trazo que el monograma de
 * public/icon.svg — para que la marca de texto y el favicon compartan una
 * sola idea visual.
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black",
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="size-[65%]" fill="none">
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
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("size-8", markClassName)} />
      {showWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          <span className="text-primary" style={{ textShadow: "0 0 14px color-mix(in oklch, var(--primary) 55%, transparent)" }}>
            ♪
          </span>
          écima
        </span>
      )}
    </span>
  )
}

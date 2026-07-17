"use client"

import { cn } from "@/lib/utils"

/**
 * Marca de Décima. La "d" minúscula de "décima" se reemplaza por un
 * corchete ("[") — mismo trazo que el monograma de public/icon.svg — para
 * que la marca de texto y el favicon compartan una sola idea visual.
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
        <rect x="37" y="24" width="14" height="52" rx="7" fill="currentColor" className="text-primary" />
        <rect x="37" y="24" width="30" height="14" rx="7" fill="currentColor" className="text-primary" />
        <rect x="37" y="62" width="30" height="14" rx="7" fill="currentColor" className="text-primary" />
        <circle cx="72" cy="69" r="10" fill="currentColor" className="text-primary" />
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
            [
          </span>
          écima
        </span>
      )}
    </span>
  )
}

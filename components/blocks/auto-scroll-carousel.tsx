"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useReducedMotion } from "framer-motion"
import { useLocale } from "@/components/locale-provider"

/** Una sola copia del contenido: los enlaces y reproductores no se duplican. */
export function AutoScrollCarousel({
  axis = "x", speed = 0.5, paused = false, className = "", innerClassName = "", ariaLabel, children,
}: {
  axis?: "x" | "y"
  /** Velocidad equivalente en píxeles por frame a60Hz. */
  speed?: number
  /** Por ejemplo, una tarjeta expandida reproduciendo un embed. */
  paused?: boolean
  className?: string
  innerClassName?: string
  ariaLabel?: string
  children: ReactNode
}) {
  const { t } = useLocale()
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const hover = useRef(false)
  const resumeAt = useRef(0)
  const [stopped, setStopped] = useState(false)
  const [focused, setFocused] = useState(false)
  const reducedMotion = useReducedMotion() === true
  const isY = axis === "y"

  useEffect(() => {
    const el = ref.current
    if (!el || paused || stopped || focused || reducedMotion || !Number.isFinite(speed) || speed <= 0) return
    let raf = 0
    let previous = 0
    let position: number | null = null
    let endReachedAt = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const elapsed = previous ? Math.min(now - previous, 64) : 0
      previous = now
      if (hover.current || now < resumeAt.current || document.hidden) {
        position = null
        endReachedAt = 0
        return
      }
      const limit = isY ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
      if (limit <= 1) return
      const current = isY ? el.scrollTop : el.scrollLeft
      // Acumular fracciones evita quedarse quieto si el navegador redondea el scroll.
      if (position === null || Math.abs(current - position) > 2) position = current
      if (current >= limit - 1) {
        if (!endReachedAt) endReachedAt = now
        if (now - endReachedAt < 1600) return
        position = 0
        endReachedAt = 0
      } else position = Math.min(limit, position + speed * elapsed / (1000 / 60))
      if (isY) el.scrollTop = position
      else el.scrollLeft = position
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isY, speed, paused, stopped, focused, reducedMotion])

  const nudge = () => { resumeAt.current = performance.now() + 1600 }
  const move = (direction: number) => {
    const el = ref.current
    if (!el) return
    setStopped(true)
    const distance = direction * (isY ? el.clientHeight : el.clientWidth) * 0.8
    el.scrollBy({ top: isY ? distance : 0, left: isY ? 0 : distance, behavior: "instant" })
  }
  const buttonClass = "min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-70"

  return <div className="min-w-0 space-y-3"
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("carousel_controls")}>
      <button type="button" aria-controls={id} className={buttonClass} onClick={() => move(-1)}>{t("carousel_previous")}</button>
      <button type="button" aria-controls={id} className={buttonClass} onClick={() => move(1)}>{t("carousel_next")}</button>
      <button type="button" aria-controls={id} className={buttonClass} disabled={reducedMotion} aria-pressed={stopped || reducedMotion}
        onClick={() => setStopped(value => !value)}>
        {t(reducedMotion ? "albums_reduced_motion" : stopped ? "albums_resume_motion" : "albums_pause_motion")}
      </button>
    </div>
    <div id={id} ref={ref} role="region" aria-label={ariaLabel ?? t("carousel_content")} tabIndex={0}
      onMouseEnter={() => { hover.current = true }}
      onMouseLeave={() => { hover.current = false }}
      onPointerDown={() => setStopped(true)}
      onWheel={nudge}
      className={`${isY ? "overflow-y-auto" : "overflow-x-auto"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}>
      <div className={innerClassName}>{children}</div>
    </div>
  </div>
}

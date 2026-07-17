"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const DRAG_THRESHOLD_PX = 5

/**
 * Arrastre con mouse/trackpad (click-and-drag) para contenedores con
 * overflow-x-auto, más flechas de paginación. Solo reacciona a
 * event.pointerType === "mouse" — el touch se deja intacto porque el scroll
 * horizontal nativo del navegador ya soporta swipe sin ayuda de JS.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Estado de arrastre en un ref (no en state) para no re-renderizar en cada
  // pointermove. "suppressNextClick" se marca en pointerup si hubo arrastre
  // real, y se autoconsume en el primer click posterior (ver
  // onClickCapture) — evita depender de un timeout/rAF para "expirarlo", que
  // podría dejarlo pegado (pestaña en segundo plano) y bloquear un click
  // legítimo posterior (ej. activado por teclado).
  const dragState = useRef({ active: false, startX: 0, startScrollLeft: 0, moved: 0, suppressNextClick: false })

  const updateScrollState = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    updateScrollState()

    const onScroll = () => updateScrollState()
    el.addEventListener("scroll", onScroll, { passive: true })

    const onResize = () => updateScrollState()
    window.addEventListener("resize", onResize)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateScrollState())
      resizeObserver.observe(el)
    }

    return () => {
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      resizeObserver?.disconnect()
    }
  }, [updateScrollState])

  const scrollByPage = useCallback((direction: "left" | "right") => {
    const el = ref.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" })
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return
    const el = ref.current
    if (!el) return
    dragState.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
      moved: 0,
      suppressNextClick: false,
    }
    setIsDragging(true)
    el.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return
    if (!dragState.current.active) return
    const el = ref.current
    if (!el) return
    const delta = event.clientX - dragState.current.startX
    dragState.current.moved = Math.max(dragState.current.moved, Math.abs(delta))
    el.scrollLeft = dragState.current.startScrollLeft - delta
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return
    if (!dragState.current.active) return
    dragState.current.active = false
    dragState.current.suppressNextClick = dragState.current.moved > DRAG_THRESHOLD_PX
    setIsDragging(false)
  }, [])

  // Si el arrastre superó el umbral, cancela el click que el navegador
  // dispara justo después de soltar — evita reproducir/abrir el álbum que
  // quedó bajo el cursor por accidente. Se autoconsume: solo afecta al
  // próximo click, nunca a los siguientes.
  const onClickCapture = useCallback((event: React.MouseEvent<T>) => {
    if (dragState.current.suppressNextClick) {
      dragState.current.suppressNextClick = false
      event.stopPropagation()
      event.preventDefault()
    }
  }, [])

  return {
    ref,
    isDragging,
    canScrollLeft,
    canScrollRight,
    scrollByPage,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerLeave: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  }
}

"use client"

// Navegador de "un elemento a la vez" para el panel de edición. Antes cada
// lista (créditos, publicaciones, redes, embeds...) apilaba TODOS sus
// elementos uno debajo de otro, así que al agregar uno nuevo aparecía hasta
// el fondo del panel y confundía. Ahora el panel muestra un solo elemento por
// vez, con su número ("Crédito 3 / 7") y flechitas ◄ ► al lado para saltar al
// anterior/siguiente. "Agregar" salta directo al elemento recién creado y
// "Eliminar" borra el que se está viendo.

import { useState } from "react"
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"

export function ItemPager({
  label,
  count,
  onAdd,
  onRemove,
  addLabel,
  emptyLabel,
  canAdd = true,
  disabledAddHint,
  hideRemove = false,
  itemsVersion,
  children,
}: {
  /** Singular del elemento, ej. "Crédito", "Publicación". */
  label: string
  count: number
  onAdd: () => void
  onRemove: (index: number) => void
  addLabel: string
  emptyLabel: string
  canAdd?: boolean
  disabledAddHint?: string
  /** Oculta el botón grande "Eliminar" del pie — úsalo cuando el propio
      contenido ya ofrece un control de borrado (ej. un tacho junto al campo). */
  hideRemove?: boolean
  /** Cambia con el contenido o contexto de la lista para invalidar un borrado pendiente. */
  itemsVersion?: string
  /** Renderiza el editor del elemento activo. */
  children: (index: number) => React.ReactNode
}) {
  const [active, setActive] = useState(0)
  const [previousCount, setPreviousCount] = useState(count)
  const [removal, setRemoval] = useState<{ index: number; version: string } | null>(null)
  const version = itemsVersion ?? String(count)
  if (removal && removal.version !== version) setRemoval(null)

  // Si la lista se encoge (o se vacía) mantené el índice dentro de rango.
  if (previousCount !== count) {
    setPreviousCount(count)
    if (count < previousCount) setActive(Math.min(active, Math.max(0, count - 1)))
  }

  const clamped = Math.min(active, Math.max(0, count - 1))

  const handleAdd = () => {
    if (!canAdd) return
    onAdd()
    // El nuevo elemento queda al final: su índice es el `count` actual.
    setActive(count)
  }

  const go = (dir: -1 | 1) => {
    const next = clamped + dir
    if (next >= 0 && next < count) setActive(next)
  }

  const AddButton = (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!canAdd}
      className="flex min-h-11 items-center gap-1 rounded px-2 text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      <Plus className="size-3" /> {addLabel}
    </button>
  )

  if (count === 0) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}s</p>
          {AddButton}
        </div>
        {disabledAddHint && !canAdd && (
          <p className="text-[11px] text-muted-foreground">{disabledAddHint}</p>
        )}
        <p className="rounded-lg border border-dashed border-sidebar-border p-3 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Barra de navegación: número del elemento + flechitas ◄ ► + agregar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={clamped === 0}
            aria-label={`${label} anterior`}
            className="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span role="status" aria-atomic="true" className="min-w-[4.5rem] text-center text-[11px] font-semibold text-foreground tabular-nums">
            {label} {clamped + 1} / {count}
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={clamped >= count - 1}
            aria-label={`${label} siguiente`}
            className="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {AddButton}
      </div>

      {disabledAddHint && !canAdd && (
        <p className="text-[11px] text-muted-foreground">{disabledAddHint}</p>
      )}

      {/* Editor del elemento activo */}
      <div className="space-y-2.5 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
        {children(clamped)}
        {!hideRemove && (
          <button
            type="button"
            onClick={() => setRemoval({ index: clamped, version })}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" /> Eliminar {label.toLowerCase()}
          </button>
        )}
      </div>
      {!hideRemove && removal && removal.version === version && (
        <ConfirmDialog
          title={`Eliminar ${label.toLowerCase()} ${removal.index + 1}`}
          description="Se quitará este elemento del bloque. Agregar uno nuevo no recuperará su contenido."
          confirmLabel="Eliminar elemento"
          onCancel={() => setRemoval(null)}
          onConfirm={() => {
            if (removal.version !== version || removal.index >= count) return
            onRemove(removal.index)
            setRemoval(null)
          }}
        />
      )}
    </div>
  )
}

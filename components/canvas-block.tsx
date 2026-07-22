"use client"

import { useState } from "react"
import type { Block, HeroData } from "@/lib/blocks"
import type { CatalogProduct, CatalogService } from "@/lib/catalog"
import { BlockRenderer } from "@/components/blocks/block-renderer"
import { ShareProfileDialog } from "@/components/blocks/share-profile-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { BLOCK_LIBRARY } from "@/lib/blocks"
import { GripVertical, Pencil, Trash2, ArrowUp, ArrowDown, Share2, Lock } from "lucide-react"

type Props = {
  block: Block
  index: number
  total: number
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  // El "banner principal" (hero) nunca se elimina del todo — este callback
  // vacía su contenido en su lugar (ver confirmación más abajo).
  onClearContent?: () => void
  onMove: (dir: -1 | 1) => void
  onDragStart: () => void
  onDragEnd: () => void
  children?: React.ReactNode
  products?: CatalogProduct[]
  services?: CatalogService[]
  shareUrl?: string
  albumCovers?: string[]
  creditsCount?: number
  // Punto 4: true cuando el rol activo ("editor" de banda) no puede tocar
  // este bloque — sin controles y sin poder abrir el inspector.
  locked?: boolean
}

export function CanvasBlock({
  block,
  index,
  total,
  selected,
  onSelect,
  onDelete,
  onClearContent,
  onMove,
  onDragStart,
  onDragEnd,
  children, // Recibimos el componente hijo aquí
  products,
  services,
  shareUrl,
  albumCovers,
  creditsCount,
  locked = false,
}: Props) {
  const label = BLOCK_LIBRARY.find((b) => b.type === block.type)?.label ?? block.type
  // Atajo de "Compartir" en el propio control pill del bloque — solo visible
  // en móvil (< sm), donde el botón que ya vive dentro del hero queda más
  // abajo en el flujo de scroll. En escritorio no se toca nada: sigue solo
  // el botón original dentro del bloque.
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // El banner principal es único en la página y no tiene sentido reordenarlo
  // — se queda fijo donde está, sin flechas ni arrastre.
  const isHero = block.type === "hero"

  return (
    <div
      onClick={locked ? undefined : onSelect}
      className={`group relative rounded-2xl border p-1.5 transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-transparent hover:border-border"
      }`}
    >
      {/* Top control bar — appears on hover / selection. Bloqueada (Punto 4,
          rol "editor"): se reemplaza por una etiqueta de solo-lectura, sin
          ningún control de edición/orden/borrado. */}
      {locked ? (
        <div className="absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-2.5 py-1 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          <Lock className="size-3 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">{label} — solo lectura</span>
        </div>
      ) : (
        <div
          className={`absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-1 py-1 opacity-100 shadow-lg transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${
            selected ? "sm:opacity-100" : ""
          }`}
        >
          {isHero ? (
            <span
              title="El banner principal queda fijo — no se puede reordenar"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground/50"
            >
              <Lock className="size-3.5" />
            </span>
          ) : (
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                onDragStart()
              }}
              onDragEnd={onDragEnd}
              onClick={(e) => e.stopPropagation()}
              title="Arrastrar para reordenar"
              aria-label="Arrastrar para reordenar bloque"
              className="flex size-7 cursor-grab items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <span className="px-1.5 text-[11px] font-medium text-muted-foreground">{label}</span>
          <div className="mx-0.5 h-4 w-px bg-border" />
          {!isHero && (
            <>
              <ControlButton
                disabled={index === 0}
                onClick={() => onMove(-1)}
                title="Subir"
                label="Subir bloque"
              >
                <ArrowUp className="size-4" />
              </ControlButton>
              <ControlButton
                disabled={index === total - 1}
                onClick={() => onMove(1)}
                title="Bajar"
                label="Bajar bloque"
              >
                <ArrowDown className="size-4" />
              </ControlButton>
            </>
          )}
          {block.type === "hero" && shareUrl && (
            <ControlButton
              onClick={() => setShareOpen(true)}
              title="Compartir"
              label="Compartir perfil"
              className="text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            >
              <Share2 className="size-4" />
            </ControlButton>
          )}
          <ControlButton onClick={onSelect} title="Editar" label="Editar bloque">
            <Pencil className="size-4" />
          </ControlButton>
          <ControlButton
            onClick={() => (isHero ? setConfirmClear(true) : onDelete())}
            title={isHero ? "Vaciar banner principal" : "Eliminar"}
            label={isHero ? "Vaciar contenido del banner principal" : "Eliminar bloque"}
            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </ControlButton>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="¿Vaciar el banner principal?"
          description="Se borrará todo el contenido de esta sección (nombre, frase, foto, redes) — el bloque se queda en tu página, pero vacío para que empieces de nuevo."
          confirmLabel="Vaciar contenido"
          onConfirm={() => {
            onClearContent?.()
            setConfirmClear(false)
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {/* Live preview content (non-interactive selection surface, salvo
          "tracks" y "single" que necesitan el mini-reproductor, "credits"
          que necesita poder abrir sus enlaces/embeds externos, y "hero"
          que necesita el botón de Compartir clicable) */}
      <div
        className={`overflow-hidden rounded-xl ${
          block.type === "tracks" ||
          block.type === "single" ||
          block.type === "credits" ||
          block.type === "hero"
            ? ""
            : "pointer-events-none"
        }`}
      >
        <BlockRenderer
          block={block}
          products={products}
          services={services}
          shareUrl={block.type === "hero" ? shareUrl : undefined}
          albumCovers={albumCovers}
          creditsCount={creditsCount}
        />
      </div>

      {/* Renderiza los componentes inyectados (como el MusicPlayer) */}
      {children}

      {shareOpen && block.type === "hero" && shareUrl && (
        <ShareProfileDialog
          shareUrl={shareUrl}
          data={block.data as HeroData}
          albumCovers={albumCovers ?? []}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function ControlButton({
  children,
  onClick,
  disabled,
  title,
  label,
  className = "text-muted-foreground hover:bg-accent hover:text-foreground",
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex size-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  )
}
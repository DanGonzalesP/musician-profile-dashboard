"use client"

import { useMemo, useState } from "react"
import type { Block, BlockType } from "@/lib/blocks"
import type { CatalogProduct, CatalogService } from "@/lib/catalog"
import { CanvasBlock } from "@/components/canvas-block"
import { useLocale } from "@/components/locale-provider"
import { MousePointerClick, Sparkles, Milestone, GalleryHorizontalEnd, Store, type LucideIcon } from "lucide-react"

type Props = {
  blocks: Block[]
  selectedId: string | null
  isDragging: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClearContent: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  // Mueve un bloque a una posición absoluta del arreglo `blocks` — lo usa el
  // reordenamiento dentro de cada pestaña (los vecinos de una misma sección
  // no siempre son adyacentes en el arreglo completo).
  onMoveTo: (id: string, targetIndex: number) => void
  onDropAt: (index: number) => void
  onReorderStart: (index: number) => void
  onDragEnd: () => void
  products?: CatalogProduct[]
  services?: CatalogService[]
  shareUrl?: string
  albumCovers?: string[]
  creditsCount?: number
  // Rol del Punto 4 sobre el perfil que se edita — "editor" solo puede abrir
  // el bloque "hero"; el resto queda bloqueado (sin controles, no seleccionable).
  activeRole?: "owner" | "admin" | "editor"
  onAlbumSelect?: (albumId: string) => void
}

// Las pestañas del EDITOR reflejan exactamente las del perfil público
// (ver app/[username]/profile-client.tsx): el artista edita su página tal
// como el público la verá, sin tener todos los bloques apilados en una sola
// columna interminable. El hero queda siempre fijo arriba, fuera de las
// pestañas. "Merch y servicios" acá SÍ es una pestaña (en el público vive en
// /tienda), porque sus bloques se editan desde este mismo lienzo.
type EditorTab = "main" | "legado" | "publicaciones" | "tienda"

const TAB_OF: Record<Exclude<BlockType, "hero">, EditorTab> = {
  single: "main",
  crowdfunding: "main",
  tracks: "main",
  credits: "main",
  legado: "legado",
  publicaciones: "publicaciones",
  embeds: "publicaciones",
  merch: "tienda",
  service: "tienda",
}

function tabOfBlock(type: BlockType): EditorTab {
  if (type === "hero") return "main"
  return TAB_OF[type]
}

export function PreviewCanvas({
  blocks,
  selectedId,
  isDragging,
  onSelect,
  onDelete,
  onClearContent,
  onMove,
  onMoveTo,
  onDropAt,
  onReorderStart,
  onDragEnd,
  products,
  services,
  shareUrl,
  albumCovers,
  creditsCount,
  activeRole = "owner",
  onAlbumSelect,
}: Props) {
  const { t } = useLocale()
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditorTab>("main")

  // El hero es único y va siempre primero (igual que en el perfil público),
  // fuera del sistema de pestañas.
  const heroEntry = useMemo(
    () => blocks.map((block, abs) => ({ block, abs })).find((x) => x.block.type === "hero"),
    [blocks]
  )
  const nonHero = useMemo(
    () => blocks.map((block, abs) => ({ block, abs })).filter((x) => x.block.type !== "hero"),
    [blocks]
  )

  // Cada pestaña solo existe si tiene contenido — salvo "Legado", que es la
  // pestaña de inicio y siempre está presente (igual que en el público).
  const tabDefs: { key: EditorTab; label: string; icon: LucideIcon }[] = [
    { key: "main", label: t("tab_home"), icon: Sparkles },
    { key: "legado", label: t("tab_legado"), icon: Milestone },
    { key: "publicaciones", label: t("tab_publicaciones"), icon: GalleryHorizontalEnd },
    { key: "tienda", label: t("profile_store_cta_title"), icon: Store },
  ]
  const tabs = tabDefs.filter((tab) => tab.key === "main" || nonHero.some((x) => tabOfBlock(x.block.type) === tab.key))
  const showTabBar = tabs.length > 1

  // Al seleccionar un bloque (o al agregar uno nuevo, que también lo
  // selecciona), saltar a la pestaña que lo contiene — así el bloque recién
  // agregado nunca queda "escondido" en otra pestaña. Se hace ajustando el
  // estado durante el render (patrón recomendado de React) en vez de con un
  // efecto, para no disparar renders en cascada.
  const [prevSelected, setPrevSelected] = useState<string | null>(selectedId)
  if (selectedId !== prevSelected) {
    setPrevSelected(selectedId)
    const found = selectedId ? blocks.find((b) => b.id === selectedId) : undefined
    if (found) setActiveTab(tabOfBlock(found.type))
  }

  // Pestaña efectiva: si la activa se quedó sin bloques (se borró el último,
  // o el tab dejó de existir), cae a "Legado" sin necesidad de un efecto.
  const effectiveTab = tabs.some((tab) => tab.key === activeTab) ? activeTab : "main"
  const visible = nonHero.filter((x) => tabOfBlock(x.block.type) === effectiveTab)

  function handleDrop(index: number) {
    onDropAt(index)
    setDropIndex(null)
  }

  // Reordenar con las flechitas ↑/↓ dentro de la pestaña activa: se busca el
  // vecino de la MISMA sección (no el adyacente del arreglo completo, que
  // podría ser de otra pestaña) y se mueve el bloque a su posición absoluta.
  function handleTabMove(id: string, dir: -1 | 1) {
    const i = visible.findIndex((v) => v.block.id === id)
    const target = i + dir
    if (i < 0 || target < 0 || target >= visible.length) return
    onMoveTo(id, dir === -1 ? visible[target].abs : visible[target].abs + 1)
  }

  // Índice absoluto donde caería algo soltado en la posición `slot` de la
  // lista visible (0 = antes del primer bloque de la pestaña).
  function insertIndexForSlot(slot: number): number {
    if (visible.length === 0) return blocks.length
    if (slot >= visible.length) return visible[visible.length - 1].abs + 1
    return visible[slot].abs
  }

  // Se renderiza con una función (renderIndicator) y NO con un componente
  // declarado dentro del cuerpo: un componente creado en cada render tiene
  // una identidad de tipo nueva cada vez, así que React desmonta y remonta
  // el subárbol y pierde su estado. Acá además rompía sutilmente el
  // arrastrar-y-soltar, porque el nodo se reemplazaba a mitad del gesto.
  const renderIndicator = (slot: number) => {
    const absIndex = insertIndexForSlot(slot)
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDropIndex(slot)
        }}
        onDrop={(e) => {
          e.preventDefault()
          handleDrop(absIndex)
        }}
        className={`relative transition-all ${isDragging ? "h-6" : "h-3"}`}
      >
        <div
          className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all ${
            dropIndex === slot ? "bg-primary opacity-100" : "opacity-0"
          }`}
        >
          <span
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground ${
              dropIndex === slot ? "opacity-100" : "opacity-0"
            }`}
          >
            Soltar aquí
          </span>
        </div>
      </div>
    )
  }

  const renderCanvasBlock = (entry: { block: Block; abs: number }, indexInTab: number, totalInTab: number) => (
    <CanvasBlock
      block={entry.block}
      index={indexInTab}
      total={totalInTab}
      selected={selectedId === entry.block.id}
      onSelect={() => onSelect(entry.block.id)}
      onDelete={() => onDelete(entry.block.id)}
      onClearContent={() => onClearContent(entry.block.id)}
      onMove={(dir) => (entry.block.type === "hero" ? onMove(entry.block.id, dir) : handleTabMove(entry.block.id, dir))}
      onDragStart={() => onReorderStart(entry.abs)}
      onDragEnd={onDragEnd}
      products={products}
      services={services}
      shareUrl={shareUrl}
      albumCovers={albumCovers}
      creditsCount={creditsCount}
      locked={activeRole === "editor" && entry.block.type !== "hero"}
      onAlbumSelect={onAlbumSelect}
    />
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div
          className="min-h-[70vh] space-y-0 p-3 sm:p-4"
          onDragOver={(e) => {
            if (blocks.length === 0) {
              e.preventDefault()
              setDropIndex(0)
            }
          }}
          onDrop={(e) => {
            if (blocks.length === 0) {
              e.preventDefault()
              handleDrop(0)
            }
          }}
        >
          {blocks.length === 0 ? (
            <div
              className={`flex min-h-[60vh] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dropIndex === 0 ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent text-primary">
                <MousePointerClick className="size-6" />
              </span>
              <p className="text-sm font-medium text-foreground">Tu perfil está vacío</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Arrastra bloques desde el panel izquierdo y suéltalos aquí, o usa el botón de más para construir tu página de artista.
              </p>
            </div>
          ) : (
            <>
              {/* El banner principal (hero) va siempre fijo arriba, fuera de
                  las pestañas — igual que en el perfil público. */}
              {heroEntry && renderCanvasBlock(heroEntry, 0, 1)}

              {/* Barra de pestañas: solo aparece cuando hay más de una sección
                  con contenido (misma lógica que el perfil público). */}
              {showTabBar && (
                <div className="mt-3 flex overflow-x-auto rounded-xl border border-border bg-card/95 px-1 shadow-md [&::-webkit-scrollbar]:hidden">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                          effectiveTab === tab.key
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="hidden size-4 sm:block" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className={showTabBar ? "mt-2" : ""}>
                {renderIndicator(0)}
                {visible.length === 0 ? (
                  <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">Esta sección está vacía</p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                      Agrega un bloque desde el panel de bloques y aparecerá aquí.
                    </p>
                  </div>
                ) : (
                  visible.map((entry, i) => (
                    <div key={entry.block.id}>
                      {renderCanvasBlock(entry, i, visible.length)}
                      {renderIndicator(i + 1)}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

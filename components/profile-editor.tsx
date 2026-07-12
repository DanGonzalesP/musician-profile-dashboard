"use client"

import { useState } from "react"
import { type Block, type BlockType, createBlock } from "@/lib/blocks"
import { EditorHeader } from "@/components/editor-header"
import { BlockLibrary } from "@/components/block-library"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BlockInspector } from "@/components/block-inspector"
import { Layers } from "lucide-react"
import { supabase } from "@/lib/supabase"

type DragPayload = { kind: "new"; type: BlockType } | { kind: "reorder"; index: number } | null

const initialBlocks: Block[] = [
  createBlock("hero"),
  createBlock("tracks"),
  createBlock("merch"),
]

export function ProfileEditor() {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload>(null)
  const [publishing, setPublishing] = useState(false)

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  // Función para guardar los bloques en Supabase
  async function handlePublish() {
    setPublishing(true)
    try {
      // Intentamos actualizar los bloques del artista en la base de datos
      const { error } = await supabase
        .from("artist")
        .update({ blocks: blocks })
        .eq("username", "novareyes") // Filtra por el usuario correspondiente

      if (error) {
        alert("Error al publicar los cambios: " + error.message)
      } else {
        alert("¡Cambios publicados con éxito en tu perfil!")
      }
    } catch (err) {
      console.error(err)
      alert("Ocurrió un error inesperado al conectar con Supabase.")
    } finally {
      setPublishing(false)
    }
  }

  function addBlock(type: BlockType) {
    const block = createBlock(type)
    setBlocks((prev) => [...prev, block])
    setSelectedId(block.id)
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id)
      const target = index + dir
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  function updateBlock(id: string, data: Block["data"]) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data } : b)))
  }

  function handleDropAt(index: number) {
    if (!dragPayload) return
    if (dragPayload.kind === "new") {
      const block = createBlock(dragPayload.type)
      setBlocks((prev) => {
        const next = [...prev]
        next.splice(index, 0, block)
        return next
      })
      setSelectedId(block.id)
    } else {
      const from = dragPayload.index
      setBlocks((prev) => {
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        const target = from < index ? index - 1 : index
        next.splice(target, 0, moved)
        return next
      })
    }
    setDragPayload(null)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Pasamos la función handlePublish y el estado publishing al Header */}
      <EditorHeader 
        blockCount={blocks.length} 
        onPublish={handlePublish} 
        isPublishing={publishing} 
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — block library */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:w-72 lg:w-80">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-3">
            <Layers className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Blocks</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Drag a block onto your profile, or press the plus button to append it.
            </p>
            <BlockLibrary
              onAdd={addBlock}
              onDragStart={(type) => setDragPayload({ kind: "new", type })}
              onDragEnd={() => setDragPayload(null)}
            />
          </div>
        </aside>

        {/* Center — live preview canvas */}
        <main className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto mb-5 flex max-w-2xl items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Live Preview</h1>
              <p className="text-xs text-muted-foreground">This is how fans will see your page.</p>
            </div>
          </div>
          <PreviewCanvas
            blocks={blocks}
            selectedId={selectedId}
            isDragging={dragPayload !== null}
            onSelect={setSelectedId}
            onDelete={deleteBlock}
            onMove={moveBlock}
            onDropAt={handleDropAt}
            onReorderStart={(index) => setDragPayload({ kind: "reorder", index })}
            onDragEnd={() => setDragPayload(null)}
          />
        </main>

        {/* Right — inspector */}
        {selectedBlock && (
          <>
            <div
              className="fixed inset-0 z-30 bg-background/70 xl:hidden"
              onClick={() => setSelectedId(null)}
              aria-hidden="true"
            />
            <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-sidebar-border bg-sidebar xl:static xl:z-auto xl:w-80 xl:max-w-none">
              <BlockInspector
                block={selectedBlock}
                onChange={updateBlock}
                onClose={() => setSelectedId(null)}
                onDelete={deleteBlock}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
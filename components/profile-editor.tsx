"use client"

import { useState, useEffect } from "react"
import { type Block, type BlockType, createBlock } from "@/lib/blocks"
import { EditorHeader } from "@/components/editor-header"
import { BlockLibrary } from "@/components/block-library"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BlockInspector } from "@/components/block-inspector"
import { Layers } from "lucide-react"
import { supabase } from "@/lib/supabase"

type DragPayload = { kind: "new"; type: BlockType } | { kind: "reorder"; index: number } | null

export function ProfileEditor() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload>(null)
  const [publishing, setPublishing] = useState(false)

  const fakeUserId = "00000000-0000-0000-0000-000000000000";
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  // Cargar bloques guardados inicialmente desde Supabase para evitar los predeterminados
  useEffect(() => {
    async function loadSavedBlocks() {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", fakeUserId)
          .single();

        if (profile) {
          const { data: dbBlocks } = await supabase
            .from("profile_blocks")
            .select("*")
            .eq("profile_id", profile.id)
            .order("position_index", { ascending: true });

          if (dbBlocks && dbBlocks.length > 0) {
            setBlocks(
              dbBlocks.map((b) => ({
                id: b.id.toString(),
                type: b.block_type as BlockType,
                data: b.content,
              }))
            );
            return;
          }
        }
        // Si no hay datos, inicializar por defecto
        setBlocks([
          createBlock("hero"),
          createBlock("tracks"),
          createBlock("merch"),
        ]);
      } catch (err) {
        console.error("Error cargando bloques iniciales:", err);
      }
    }
    loadSavedBlocks();
  }, []);

  // Función para generar imágenes con IA usando nuestro nuevo endpoint
  async function generarBannerConIA(promptTexto: string) {
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: promptTexto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error en la IA");
      return data.url; 
    } catch (err: any) {
      console.error(err);
      alert("Error al generar la imagen con IA: " + err.message);
      return null;
    }
  }

  // Función para guardar los bloques en la base de datos estructurada
  async function handlePublish() {
    setPublishing(true)
    try {
      // 1. Asegurar o actualizar el perfil base
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .upsert({ 
          user_id: fakeUserId,
          display_name: "Nova Reyes",
          bio: "Artista Musical"
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (profileError) throw profileError;

      // 2. Limpiar bloques anteriores e insertar el nuevo orden reflejando los estados dinámicos
      await supabase.from("profile_blocks").delete().eq("profile_id", profile.id);

      const { error: blocksError } = await supabase
        .from("profile_blocks")
        .insert(
          blocks.map((b, index) => ({
            profile_id: profile.id,
            block_type: b.type,
            position_index: index,
            content: b.data || {}, // Aquí se inyectan las canciones y productos nuevos de forma estricta
            is_visible: true
          }))
        );

      if (blocksError) throw blocksError;

      alert("¡Cambios publicados con éxito en tu perfil dinámico!")
    } catch (err: any) {
      console.error(err)
      alert("Ocurrió un error al conectar con Supabase: " + err.message)
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
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...data } } : b)))
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
    navigator.vibrate?.(10)
    setDragPayload(null)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
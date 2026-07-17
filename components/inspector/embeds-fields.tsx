"use client"

import { Plus, Trash2 } from "lucide-react"
import type { EmbedItem, EmbedPlatform, EmbedsData } from "@/lib/blocks"
import { Field, TextInput, ImageUploader, type BlobRegistry } from "@/components/block-inspector"

export function EmbedsFields({
  data,
  onChange,
  blobRegistry,
}: {
  data: EmbedsData
  onChange: (d: EmbedsData) => void
  blobRegistry: BlobRegistry
}) {
  const items = data.items

  const addItem = () => {
    onChange({
      items: [...items, { id: `embed-${Date.now()}`, platform: "youtube", url: "", title: "", thumbnail: "" }],
    })
  }

  const setItem = (index: number, changes: Partial<EmbedItem>) => {
    onChange({ items: items.map((it, i) => (i === index ? { ...it, ...changes } : it)) })
  }

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Enlaces de YouTube y TikTok
        </p>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Agregar enlace
        </button>
      </div>

      {items.map((item, index) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-sidebar-border bg-background/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg border border-sidebar-border bg-background p-0.5">
              {(["youtube", "tiktok"] as EmbedPlatform[]).map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setItem(index, { platform })}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    item.platform === platform
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {platform === "youtube" ? "YouTube" : "TikTok"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Eliminar enlace"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <TextInput
            value={item.url}
            onChange={(e) => setItem(index, { url: e.target.value })}
            placeholder={item.platform === "youtube" ? "https://youtube.com/watch?v=..." : "https://tiktok.com/@usuario/video/..."}
          />
          <TextInput
            value={item.title || ""}
            onChange={(e) => setItem(index, { title: e.target.value })}
            placeholder="Título (opcional)"
          />

          {item.platform === "tiktok" && (
            <Field label="Miniatura (opcional — TikTok no se embebe en vivo)">
              <ImageUploader
                currentImageUrl={item.thumbnail}
                onUploadReady={(url) => setItem(index, { thumbnail: url })}
                blobRegistry={blobRegistry}
              />
            </Field>
          )}
        </div>
      ))}
    </div>
  )
}

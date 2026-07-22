"use client"

import type { EmbedItem, EmbedPlatform, EmbedsData } from "@/lib/blocks"
import { Field, TextInput, ImageUploader, type BlobRegistry } from "@/components/block-inspector"
import { ItemPager } from "@/components/inspector/item-pager"

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
    <div className="space-y-2 border-t border-sidebar-border pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Enlaces de YouTube y TikTok
      </p>
      <ItemPager
        label="Enlace"
        count={items.length}
        onAdd={addItem}
        onRemove={removeItem}
        addLabel="Agregar enlace"
        emptyLabel="Añade tu primer enlace de YouTube o TikTok."
      >
        {(index) => {
          const item = items[index]
          if (!item) return null
          return (
            <>
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
            </>
          )
        }}
      </ItemPager>
    </div>
  )
}

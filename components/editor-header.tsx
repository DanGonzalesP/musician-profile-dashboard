"use client"

import { AudioWaveform, Eye, Rocket, Undo2, Redo2 } from "lucide-react"

type Props = {
  blockCount: number
  onPublish: () => void      // Nueva propiedad para la función de guardado
  isPublishing: boolean      // Nueva propiedad para saber si está cargando
}

export function EditorHeader({ blockCount, onPublish, isPublishing }: Props) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <AudioWaveform className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Amplitude</p>
          <p className="text-xs text-muted-foreground">Profile Studio</p>
        </div>
      </div>

      <div className="hidden items-center gap-1 rounded-full border border-border bg-card px-1 py-1 sm:flex">
        <button
          type="button"
          aria-label="Undo"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Redo2 className="size-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-border" />
        <span className="px-2 text-xs text-muted-foreground">
          {blockCount} {blockCount === 1 ? "block" : "blocks"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">Preview</span>
        </button>
        
        {/* Botón Vinculado a Supabase */}
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Rocket className="size-4" />
          <span className="hidden sm:inline">
            {isPublishing ? "Publishing..." : "Publish"}
          </span>
        </button>
      </div>
    </header>
  )
}
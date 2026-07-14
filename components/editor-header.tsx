"use client"

import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EditorHeader({
  blockCount,
  onPublish,
  isPublishing,
  publicSlug,
}: {
  blockCount: number
  onPublish: () => void
  isPublishing: boolean
  publicSlug?: string
}) {
  // Mismo destino que "Ver Portal Público" en el panel admin: la página
  // pública real una vez publicada. Si todavía no hay slug (nunca se
  // publicó), cae de respaldo al draft de /perfil/preview.
  const previewHref = publicSlug ? `/${publicSlug}` : "/perfil/preview"

  return (
    <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3">
      <div className="text-sm font-semibold">
        Dashboard <span className="text-muted-foreground font-normal">({blockCount} blocks)</span>
      </div>
      <div className="flex gap-2">
        <Link href="/perfil/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Panel Admin
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.open(previewHref, '_blank')}>
          Preview
        </Button>
        <Button
          size="sm"
          onClick={onPublish}
          disabled={isPublishing}
        >
          {isPublishing ? "Publishing..." : "Publish"}
        </Button>
      </div>
    </header>
  )
}
"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ProfileSwitcher } from "@/components/profile-switcher"
import { Logo } from "@/components/logo"

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
    <header className="glass-panel sticky top-0 z-20 flex items-center justify-between border-b border-sidebar-border px-4 py-3">
      <div className="flex items-center gap-4">
        <Logo showWordmark={false} markClassName="size-7" />
        <div className="h-5 w-px bg-sidebar-border" aria-hidden="true" />
        <div className="text-sm font-semibold">
          Editor <span className="text-muted-foreground font-normal">({blockCount} bloques)</span>
        </div>
        <ProfileSwitcher />
      </div>
      <div className="flex gap-2">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-3.5" />
          Volver al Feed
        </Link>
        <Link href="/perfil/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Panel Admin
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.open(previewHref, '_blank')}>
          Vista previa
        </Button>
        <Button
          size="sm"
          onClick={onPublish}
          disabled={isPublishing}
        >
          {isPublishing ? "Publicando..." : "Publicar"}
        </Button>
      </div>
    </header>
  )
}
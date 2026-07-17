"use client"

import Link from "next/link"
import { ArrowLeft, Layers, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ProfileSwitcher } from "@/components/profile-switcher"
import { Logo } from "@/components/logo"
import type { BandRole } from "@/lib/bands"

export function EditorHeader({
  blockCount,
  onPublish,
  isPublishing,
  publicSlug,
  activeRole = "owner",
  mobileBlocksOpen = false,
  onToggleBlocks,
}: {
  blockCount: number
  onPublish: () => void
  isPublishing: boolean
  publicSlug?: string
  activeRole?: BandRole
  mobileBlocksOpen?: boolean
  onToggleBlocks?: () => void
}) {
  // Mismo destino que "Ver Portal Público" en el panel admin: la página
  // pública real una vez publicada. Si todavía no hay slug (nunca se
  // publicó), cae de respaldo al draft de /perfil/preview.
  const previewHref = publicSlug ? `/${publicSlug}` : "/perfil/preview"

  return (
    <header className="glass-panel sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-sidebar-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Logo showWordmark={false} markClassName="size-7" />
        <div className="hidden h-5 w-px bg-sidebar-border sm:block" aria-hidden="true" />
        <div className="text-sm font-semibold">
          Editor <span className="text-muted-foreground font-normal">({blockCount} bloques)</span>
        </div>
        {onToggleBlocks && (
          <button
            type="button"
            onClick={onToggleBlocks}
            aria-pressed={mobileBlocksOpen}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 xl:hidden")}
          >
            <Layers className="size-3.5" />
            Bloques
          </button>
        )}
        <ProfileSwitcher />
        {activeRole === "editor" && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600">
            Rol: Editor — solo fotos, redes y biografía
          </span>
        )}
        {activeRole === "admin" && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            Rol: Administrador Total
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-3.5" />
          Volver al Feed
        </Link>
        <Link href="/perfil/banda" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <Users className="size-3.5" />
          Bandas
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
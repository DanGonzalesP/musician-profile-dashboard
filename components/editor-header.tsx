"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Layers, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ProfileSwitcher } from "@/components/profile-switcher"
import { Logo } from "@/components/logo"
import { supabase } from "@/lib/supabase"
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

  // "Grupos" solo se muestra si el artista ya creó más de un grupo musical
  // — igual que en el panel (ver LayoutAdmin.tsx).
  const [ownedBandCount, setOwnedBandCount] = useState(0)
  useEffect(() => {
    async function cargarBandas() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", user.id)
        .eq("profile_type", "band")
      setOwnedBandCount(count ?? 0)
    }
    cargarBandas()
  }, [])

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
          href="/perfil/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-3.5" />
          Volver al Panel
        </Link>
        {ownedBandCount > 1 && (
          <Link href="/perfil/banda" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <Users className="size-3.5" />
            Grupos
          </Link>
        )}
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
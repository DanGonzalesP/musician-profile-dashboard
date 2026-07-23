"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, MoreHorizontal, Users, X } from "lucide-react"
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
}: {
  blockCount: number
  onPublish: () => void
  isPublishing: boolean
  /** Slug de la página pública ya publicada — vacío si el perfil todavía no publicó nunca. */
  publicSlug?: string
  activeRole?: BandRole
}) {
  // "Vista previa" muestra el BORRADOR (draft_content) tal como quedaría el
  // perfil con los cambios sin publicar todavía, embebido en un modal dentro
  // del propio editor (no navega a otra página) — ver `previewOpen` abajo.
  // "Ver mi perfil" en cambio sí sale a la página pública YA publicada.
  const previewHref = "/perfil/preview?embed=1"
  const [previewOpen, setPreviewOpen] = useState(false)

  // "Grupos" solo se muestra si el artista ya creó más de un grupo musical
  // — igual que en el panel (ver LayoutAdmin.tsx).
  const [ownedBandCount, setOwnedBandCount] = useState(0)
  // Menú "⋯" de acciones secundarias en móvil (< xl) — evita amontonar
  // Volver/Grupos/Panel Admin/Vista previa en una fila angosta. Desde xl
  // (escritorio) esas mismas acciones se muestran siempre en línea, sin menú.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
      <div className="flex flex-wrap items-center gap-2">
        {/* Escritorio (xl+): acciones secundarias siempre en línea, como antes. */}
        <div className="hidden items-center gap-2 xl:flex">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ArrowLeft className="size-3.5" />
            Volver al feed
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
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Vista previa
          </Button>
          {publicSlug && (
            <Link
              href={`/${publicSlug}`}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <ExternalLink className="size-3.5" />
              Ver mi perfil
            </Link>
          )}
        </div>

        {/* Móvil (< xl): las mismas acciones secundarias colapsadas en un
            menú "⋯", como el overflow de Instagram/TikTok — el header no se
            llena de botones en una pantalla angosta. */}
        <div className="relative xl:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Más opciones"
            aria-expanded={mobileMenuOpen}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "size-8 p-0")}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-lg border border-sidebar-border bg-popover p-1 shadow-xl">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                >
                  <ArrowLeft className="size-3.5" />
                  Volver al feed
                </Link>
                {ownedBandCount > 1 && (
                  <Link
                    href="/perfil/banda"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Users className="size-3.5" />
                    Grupos
                  </Link>
                )}
                <Link
                  href="/perfil/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                >
                  Panel Admin
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setPreviewOpen(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
                  Vista previa
                </button>
                {publicSlug && (
                  <Link
                    href={`/${publicSlug}`}
                    target="_blank"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <ExternalLink className="size-3.5" />
                    Ver mi perfil
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

        {/* En móvil "Publicar" vive en la barra fija inferior (más a mano
            del pulgar) — acá solo se muestra desde xl, como siempre. */}
        <Button
          size="sm"
          onClick={onPublish}
          disabled={isPublishing}
          className="hidden xl:inline-flex"
        >
          {isPublishing ? "Publicando..." : "Publicar"}
        </Button>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">
              Vista previa <span className="font-normal text-muted-foreground">— así se vería tu perfil publicado</span>
            </span>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Cerrar vista previa"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
              Cerrar
            </button>
          </div>
          <iframe src={previewHref} title="Vista previa del perfil" className="w-full flex-1 border-0 bg-background" />
        </div>
      )}
    </header>
  )
}
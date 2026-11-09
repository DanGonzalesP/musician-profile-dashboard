"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, MoreHorizontal, Users, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ProfileSwitcher } from "@/components/profile-switcher"
import { Logo } from "@/components/logo"
import { supabase } from "@/lib/supabase"
import type { BandRole } from "@/lib/bands"
import { PerfilPreviewContent, type PreviewContent } from "@/components/perfil-preview-content"

export function EditorHeader({
  blockCount,
  onPublish,
  isPublishing,
  publicSlug,
  activeRole = "owner",
  draftMessage,
  draftFailed = false,
  switchingDisabled = false,
  onBeforeProfileReload,
  onBeforeNavigate,
  previewContent,
  onDownloadCopy,
}: {
  blockCount: number
  onPublish: () => void
  isPublishing: boolean
  /** Slug de la página pública ya publicada — vacío si el perfil todavía no publicó nunca. */
  publicSlug?: string
  activeRole?: BandRole
  draftMessage?: string
  draftFailed?: boolean
  switchingDisabled?: boolean
  onBeforeProfileReload?: () => (() => void)
  onBeforeNavigate?: () => boolean
  previewContent?: PreviewContent
  onDownloadCopy?: () => void
}) {
  // "Vista previa" muestra el BORRADOR (draft_content) tal como quedaría el
  // perfil con los cambios sin publicar todavía, en un modal dentro del
  // propio editor (no navega a otra página) — ver `previewOpen` abajo. Se
  // renderiza el componente DIRECTAMENTE (no en un <iframe>): un iframe
  // apuntando a la misma app queda bloqueado por el navegador ("Este
  // contenido está bloqueado") en cuanto la propia app ya está embebida en
  // otro iframe externo, porque frame-ancestors/X-Frame-Options evalúan toda
  // la cadena de ancestros. "Ver mi perfil" en cambio sí sale a la página
  // pública YA publicada.
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewDialog = useRef<HTMLDialogElement>(null)
  const moreButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!previewOpen) return
    const dialog = previewDialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      previousFocus?.focus()
    }
  }, [previewOpen])

  // "Grupos" solo se muestra si el artista ya creó más de un grupo musical
  // — igual que en el panel (ver LayoutAdmin.tsx).
  const [ownedBandCount, setOwnedBandCount] = useState(0)
  // Menú "⋯" de acciones secundarias en móvil (< xl) — evita amontonar
  // Volver/Grupos/Panel Admin/Vista previa en una fila angosta. Desde xl
  // (escritorio) esas mismas acciones se muestran siempre en línea, sin menú.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  function guardNavigation(event: { preventDefault: () => void }) {
    if (onBeforeNavigate && !onBeforeNavigate()) event.preventDefault()
  }
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
        <Logo showWordmark={false} markClassName="size-7" onNavigate={guardNavigation} />
        <div className="hidden h-5 w-px bg-sidebar-border sm:block" aria-hidden="true" />
        <div className="text-sm font-semibold">
          Editor <span className="text-muted-foreground font-normal">({blockCount} bloques)</span>
        </div>
        <ProfileSwitcher disabled={isPublishing || switchingDisabled} onBeforeReload={onBeforeProfileReload} />
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
            onNavigate={guardNavigation}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ArrowLeft className="size-3.5" />
            Volver al feed
          </Link>
          {ownedBandCount > 1 && (
            <Link href="/perfil/banda" onNavigate={guardNavigation} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
              <Users className="size-3.5" />
              Grupos
            </Link>
          )}
          <Link href="/perfil/dashboard" onNavigate={guardNavigation} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Panel Admin
          </Link>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Vista previa
          </Button>
          {onDownloadCopy && <Button variant="outline" size="sm" className="min-h-11" onClick={onDownloadCopy}>
            Descargar borrador
          </Button>}
          {publicSlug && (
            <Link
              href={`/${publicSlug}`}
              target="_blank"
              rel="noopener noreferrer"
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
            ref={moreButton}
            aria-controls="editor-more-options"
            aria-label="Más opciones"
            aria-expanded={mobileMenuOpen}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "size-11 p-0")}
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
              <div id="editor-more-options" onKeyDown={event => { if (event.key === "Escape") { setMobileMenuOpen(false); moreButton.current?.focus() } }} className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-sidebar-border bg-popover p-1 shadow-xl">
                <Link
                  href="/"
                  onNavigate={guardNavigation}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 min-h-11 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                >
                  <ArrowLeft className="size-3.5" />
                  Volver al feed
                </Link>
                {ownedBandCount > 1 && (
                  <Link
                    href="/perfil/banda"
                    onNavigate={guardNavigation}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 min-h-11 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Users className="size-3.5" />
                    Grupos
                  </Link>
                )}
                <Link
                  href="/perfil/dashboard"
                  onNavigate={guardNavigation}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 min-h-11 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                >
                  Panel Admin
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setPreviewOpen(true)
                  }}
                  className="flex w-full items-center gap-2 min-h-11 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
                  Vista previa
                </button>
                {onDownloadCopy && <button type="button" onClick={() => {
                  setMobileMenuOpen(false)
                  onDownloadCopy()
                }} className="flex min-h-11 w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent">
                  Descargar copia del borrador
                </button>}
                {publicSlug && (
                  <Link
                    href={`/${publicSlug}`}
                    target="_blank"
              rel="noopener noreferrer"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 min-h-11 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
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

      {draftMessage && <p role={draftFailed ? "alert" : "status"} className={cn("basis-full text-xs", draftFailed ? "text-destructive" : "text-muted-foreground")}>{draftMessage}</p>}
      {previewOpen && (
        <dialog ref={previewDialog} aria-labelledby="editor-preview-title" onCancel={() => setPreviewOpen(false)} className="fixed inset-0 z-[100] m-0 flex h-dvh max-h-none w-screen max-w-none flex-col border-0 bg-background p-0 text-foreground">
          <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2.5">
            <h2 id="editor-preview-title" className="text-sm font-semibold text-foreground">
              Vista previa <span className="font-normal text-muted-foreground">— así se vería tu perfil publicado</span>
            </h2>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Cerrar vista previa"
              className="flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
              Cerrar
            </button>
          </div>
          <div className="min-h-0 w-full flex-1 overflow-y-auto bg-background">
            <PerfilPreviewContent embedded content={previewContent} />
          </div>
        </dialog>
      )}
    </header>
  )
}

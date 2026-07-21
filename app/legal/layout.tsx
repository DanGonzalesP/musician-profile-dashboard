import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Logo } from "@/components/logo"
import { LEGAL_LAST_UPDATE } from "@/lib/site"

// Cascarón compartido del centro legal: navegación entre políticas y la
// tipografía base de los textos largos (los <article> de cada página).

const LEGAL_LINKS = [
  { href: "/legal/terminos", label: "Términos y Condiciones" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/copyright", label: "Derechos de autor" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/comunidad", label: "Normas de comunidad" },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Volver al feed
          </Link>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-5 pb-3 [&::-webkit-scrollbar]:hidden">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10">
        {children}
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          Última actualización: {LEGAL_LAST_UPDATE}. Estos documentos son una base preparada para una
          plataforma de música con contenido de usuarios; no constituyen asesoría legal — antes del
          lanzamiento conviene que un abogado los revise para tu caso concreto.
        </p>
      </main>
    </div>
  )
}

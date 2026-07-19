import Link from "next/link"
import { FileText, Lock, Music2, Cookie, Users } from "lucide-react"

export const metadata = { title: "Centro legal — vibra" }

const DOCS = [
  {
    href: "/legal/terminos",
    icon: FileText,
    title: "Términos y Condiciones",
    description: "Las reglas de uso de vibra: tu cuenta, tu contenido, la tienda y los servicios.",
  },
  {
    href: "/legal/privacidad",
    icon: Lock,
    title: "Política de Privacidad",
    description: "Qué datos recogemos, para qué, con quién se procesan y tus derechos.",
  },
  {
    href: "/legal/copyright",
    icon: Music2,
    title: "Política de Derechos de Autor",
    description: "Cómo protegemos la música: reclamos por infracción, retiros y contranotificaciones.",
  },
  {
    href: "/legal/cookies",
    icon: Cookie,
    title: "Política de Cookies y almacenamiento local",
    description: "Qué guardamos en tu navegador (tema, idioma, sesión) y cómo controlarlo.",
  },
  {
    href: "/legal/comunidad",
    icon: Users,
    title: "Normas de Comunidad",
    description: "Lo que esperamos de cada artista y fan para que la plataforma sea un buen escenario.",
  },
]

export default function LegalHubPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground">Centro legal</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        vibra es una plataforma donde los músicos publican su obra, venden sus productos y ofrecen
        sus servicios. Estos documentos explican cómo funciona todo eso de forma justa y segura para
        artistas y fans.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DOCS.map((doc) => {
          const Icon = doc.icon
          return (
            <Link
              key={doc.href}
              href={doc.href}
              className="group rounded-2xl border border-border bg-card/40 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_12px_32px_-16px_var(--primary)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground group-hover:text-primary">{doc.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{doc.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

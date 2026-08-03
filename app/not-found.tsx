import Link from "next/link"
import { LogoMark } from "@/components/logo"

export const metadata = {
  title: "Página no encontrada — Vibe",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
      <LogoMark className="size-10 opacity-80" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Esta página no existe</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Puede que el enlace esté mal escrito, o que el artista haya cambiado su nombre de usuario
          hace mucho.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Ir al feed
      </Link>
    </div>
  )
}

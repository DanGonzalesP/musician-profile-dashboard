import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import Link from "next/link"
import { redirect } from "next/navigation"
import { hasPlatformPermission } from "@/lib/admin"

export const dynamic = "force-dynamic"

export default async function AdministrationPage() {
  const cookieStore = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect("/login?redirect=/admin")
  const [moderation, maintenance, roles] = await Promise.all([
    hasPlatformPermission(client, "moderation"),
    hasPlatformPermission(client, "maintenance"),
    hasPlatformPermission(client, "roles"),
  ])
  const sections = [
    ...(roles ? [{ href: "/admin/roles", title: "Permisos del equipo", description: "Consultar, asignar y retirar roles administrativos." }] : []),
    ...(moderation ? [
      { href: "/admin/reportes", title: "Reportes", description: "Revisar contenido reportado y registrar decisiones." },
      { href: "/admin/reportes?status=revisiones", title: "Solicitudes de revisión", description: "Atender solicitudes pendientes sobre decisiones de moderación." },
      { href: "/admin/auditoria", title: "Historial de operaciones", description: "Consultar decisiones y su trazabilidad." },
    ] : []),
    ...(maintenance ? [
      { href: "/admin/mantenimiento", title: "Estado del mantenimiento", description: "Consultar cierres pendientes y reservas vencidas sin ejecutar cambios." },
      { href: "/cleanup", title: "Limpieza manual", description: "Consultar y retirar archivos sin uso de tu propio inventario." },
    ] : []),
  ]
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <Link href="/perfil/config" className="inline-flex min-h-11 items-center underline">Volver a mi panel</Link>
    <header><h1 className="text-3xl font-bold">Administración de Vibe</h1><p className="mt-2 text-muted-foreground">Herramientas disponibles según los permisos de tu cuenta.</p></header>
    {sections.length ? <nav aria-label="Herramientas de administración" className="grid gap-4 sm:grid-cols-2">
      {sections.map(section => <Link key={section.href} href={section.href} className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
      </Link>)}
    </nav> : <div role="status" className="rounded-xl border border-border p-5">
      <p>No hay herramientas administrativas disponibles para esta sesión.</p>
      <p className="mt-2 text-sm text-muted-foreground">Si tienes permisos asignados, vuelve a cargar la página para consultar su estado.</p>
      <form action="/admin" method="get"><button type="submit" className="mt-3 inline-flex min-h-11 items-center underline">Consultar de nuevo</button></form>
    </div>}
  </main>
}

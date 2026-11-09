import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { redirect } from "next/navigation"
import Link from "next/link"
import { hasPlatformPermission } from "@/lib/admin"
import RoleManager from "./role-manager"

export const dynamic = "force-dynamic"

export default async function RolesPage() {
  const cookieStore = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect("/login?redirect=/admin/roles")
  if (!(await hasPlatformPermission(client, "roles"))) redirect("/admin")
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <Link href="/admin" className="inline-flex min-h-11 items-center underline">Administración de Vibe</Link>
    <header><h1 className="text-3xl font-bold">Permisos del equipo</h1><p className="mt-2 text-muted-foreground">Cada cuenta tiene como máximo un rol administrativo. Cambiarlo sustituye el anterior; retirarlo conserva la cuenta y su contenido.</p></header>
    <RoleManager key={user.id} actorId={user.id} />
  </main>
}

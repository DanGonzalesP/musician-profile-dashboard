import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { redirect } from "next/navigation"
import Link from "next/link"
import { hasPlatformPermission } from "@/lib/admin"
import ReportQueue, { RefreshReports, type ReportRow } from "./report-queue"

export const dynamic = "force-dynamic"
const statuses = { pendiente: "Pendientes", en_revision: "En revisión", aceptado: "Aceptados", rechazado: "Rechazados", revisiones: "Solicitudes sin respuesta" }
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cookieStore = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect("/login?redirect=/admin/reportes")
  if (!(await hasPlatformPermission(client, "moderation"))) redirect("/")
  const params = await searchParams
  const status = typeof params.status === "string" && Object.hasOwn(statuses, params.status) ? params.status : "pendiente"
  const value = Number(params.offset ?? 0)
  const offset = Number.isInteger(value) && value >= 0 && value <= 10000 ? value : 0
  const { data, error } = status === "revisiones"
    ? await client.rpc("pending_moderation_reviews", { p_offset: offset })
    : await client.rpc("moderation_queue", { p_status: status, p_offset: offset })
  const rows = (data ?? []) as ReportRow[]
  const contexts = rows.length ? await client.rpc("moderation_report_context", { p_report_ids: rows.map(row => row.id) }) : { data: [], error: null }
  type ContextRow = { report_id: string; username: string; can_suspend: boolean; can_restore: boolean }
  const byReport = new Map(((contexts.data ?? []) as ContextRow[]).map(context => [context.report_id, context]))
  const queue = rows.map(row => ({ ...row, username: byReport.get(row.id)?.username ?? null, can_suspend: byReport.get(row.id)?.can_suspend === true, can_restore: byReport.get(row.id)?.can_restore === true }))
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <Link href="/admin" className="inline-flex min-h-11 items-center underline">Administración de Vibe</Link>
    <Link href="/admin/auditoria" className="ml-4 underline">Historial de operaciones</Link>
    <header><h1 className="text-3xl font-bold">Revisión de reportes</h1><p className="mt-2 text-muted-foreground">Revisa los hechos antes de decidir. Cada decisión requiere una nota y queda registrada.</p></header>
    <nav aria-label="Estado de los reportes" className="flex flex-wrap gap-4">{Object.entries(statuses).map(([key, label]) => <Link key={key} href={`/admin/reportes?status=${key}`} aria-current={status === key ? "page" : undefined} className="underline underline-offset-4">{label}</Link>)}</nav>
    {status === "revisiones" && <p className="text-sm text-muted-foreground">Solicitudes pendientes de respuesta, empezando por la más antigua. Abre el historial de cada expediente para leerlas. La respuesta requiere un moderador que no haya participado en la decisión.</p>}
    {error || contexts.error ? <div role="alert" className="space-y-2"><p>No pudimos cargar los reportes.</p><RefreshReports /></div> : <ReportQueue rows={queue} pendingReviews={status === "revisiones"} />}
    <nav aria-label="Páginas de reportes" className="flex justify-between gap-4">
      {offset > 0 ? <Link href={`/admin/reportes?status=${status}&offset=${Math.max(0, offset - 50)}`}>Anterior</Link> : <span />}
      {!error && data?.length === 50 && offset < 10000 ? <Link href={`/admin/reportes?status=${status}&offset=${offset + 50}`}>Siguiente</Link> : null}
    </nav>
  </main>
}

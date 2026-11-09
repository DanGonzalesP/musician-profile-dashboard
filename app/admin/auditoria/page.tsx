import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { redirect } from "next/navigation"
import Link from "next/link"
import { hasPlatformPermission } from "@/lib/admin"

export const dynamic = "force-dynamic"
type AuditRow = { id: string; actor_user_id: string | null; action: string; target_table: string | null; target_id: string | null; note: string | null; created_at: string }
const actionNames: Record<string, string> = { review: "Revisión abierta", dismiss: "Reporte rechazado", accept: "Reporte aceptado sin retirada", suspend: "Perfil retirado", restore: "Perfil restituido", revoke: "Decisión revocada sin cambiar otras sanciones" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cookieStore = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect("/login?redirect=/admin/auditoria")
  if (!(await hasPlatformPermission(client, "moderation"))) redirect("/")
  const owner = await hasPlatformPermission(client, "roles")
  const params = await searchParams
  const source = params.source ?? "moderation"
  const before = params.before
  const reportId = params.reportId
  const invalid = (source !== "moderation" && source !== "activity") ||
    (before !== undefined && (typeof before !== "string" || !/^[1-9][0-9]{0,18}$/.test(before) || BigInt(before) > BigInt("9223372036854775807"))) ||
    (reportId !== undefined && (source !== "moderation" || typeof reportId !== "string" || !uuid.test(reportId)))
  const denied = source === "activity" && !owner
  const result = invalid || denied ? null : await client.rpc("platform_audit_feed", {
    p_source: source, p_before: before ?? null, p_report_id: reportId ?? null,
  })
  const rows = (result?.error ? [] : result?.data ?? []) as AuditRow[]
  const visible = rows.slice(0, 50)
  const query = new URLSearchParams({ source: typeof source === "string" ? source : "moderation" })
  if (typeof reportId === "string") query.set("reportId", reportId)
  if (visible.length) query.set("before", visible[visible.length - 1].id)
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <Link href="/admin/reportes" className="underline">Volver a reportes</Link>
    <header><h1 className="text-3xl font-bold">Historial de operaciones</h1><p className="mt-2 text-muted-foreground">Consulta quién tomó una decisión y cuándo. Este historial es de solo lectura.</p></header>
    <nav aria-label="Tipo de historial" className="flex flex-wrap gap-4">
      <Link href="/admin/auditoria" aria-current={source === "moderation" ? "page" : undefined} className="underline">Decisiones de moderación</Link>
      {owner && <Link href="/admin/auditoria?source=activity" aria-current={source === "activity" ? "page" : undefined} className="underline">Actividad histórica</Link>}
    </nav>
    {source === "activity" && owner && <p className="text-sm text-muted-foreground">El registro histórico incluye eventos comunicados por clientes antiguos; por sí solo no acredita una decisión de moderación. Los datos adicionales de esos eventos no se muestran.</p>}
    {source === "moderation" && <form action="/admin/auditoria" className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><label htmlFor="reportId" className="block font-medium">Identificador del reporte</label><input id="reportId" name="reportId" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" defaultValue={typeof reportId === "string" ? reportId : ""} className="w-full rounded-md border bg-background p-2" /></div>
      <button type="submit" className="rounded-md border px-4 py-2">Buscar reporte</button>
      {reportId && <Link href="/admin/auditoria" className="underline">Quitar filtro</Link>}
    </form>}
    {invalid || denied || result?.error ? <p role="alert">{invalid ? "Revisa el identificador o el enlace de consulta." : denied ? "Este historial requiere permiso de administrador." : "No pudimos cargar el historial. Vuelve a intentarlo."}</p> : <>
      {!visible.length && <p>No hay operaciones para esta consulta.</p>}
      <ol aria-label="Operaciones registradas" className="space-y-4">{visible.map(row => <li key={row.id} className="space-y-3 rounded-xl border p-5">
        <h2 className="break-words text-lg font-semibold">{source === "moderation" ? actionNames[row.action] ?? row.action : row.action}</h2>
        <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })} (hora de Perú)</time>
        <dl className="space-y-1 text-sm"><dt>Responsable (identificador)</dt><dd className="break-all">{row.actor_user_id ?? "No disponible en el registro"}</dd><dt>Referencia</dt><dd className="break-all">{row.target_table}: {row.target_id ?? "No indicada"}</dd></dl>
        {row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
      </li>)}</ol>
      <nav aria-label="Páginas del historial" className="flex flex-wrap gap-4">
        {before && <Link href={typeof reportId === "string" ? `/admin/auditoria?source=moderation&reportId=${encodeURIComponent(reportId)}` : `/admin/auditoria?source=${source}`} className="underline">Más recientes</Link>}
        {rows.length > 50 && <Link href={`/admin/auditoria?${query}`} className="underline">Operaciones anteriores</Link>}
      </nav>
    </>}
  </main>
}


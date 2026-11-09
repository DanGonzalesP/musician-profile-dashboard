"use client"

// Lista "Mis grupos musicales" + invitaciones recibidas. La CREACIÓN vive en
// el asistente propio (/grupo/nuevo, estilo "crear página de empresa") y la
// GESTIÓN de cada grupo en su panel (/grupo/[id]) — esta página solo lista.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import LayoutAdmin from "@/components/LayoutAdmin"
import {
  fetchBandMembers,
  fetchMyPendingInvites,
  fetchMyProfiles,
  respondToInvite,
  setActiveBandId,
  type PendingInvite,
  type BandRole,
} from "@/lib/bands"
import { ArrowRight, Check, Loader2, Pencil, Plus, Sparkles, Users, X as XIcon } from "lucide-react"

type OwnedGroup = { id: string; displayName: string; activeMembers: number; role: BandRole }
type AccountContext = { active: boolean; invalidated: boolean; owner: string | null | undefined }
type AuthRead = { ok: true; user: { id: string } | null } | { ok: false }

// Lectura de la cuenta actual. Un error o rechazo de Auth se trata igual que
// antes: la página muestra el error de carga, nunca datos de otra cuenta.
async function readAuth(): Promise<AuthRead> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    return error ? { ok: false } : { ok: true, user }
  } catch {
    return { ok: false }
  }
}

const ROLE_LABELS: Record<"admin" | "editor", string> = {
  admin: "Administrador",
  editor: "Editor",
}

export default function GruposPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [requiresReload, setRequiresReload] = useState(false)
  const respondingRef = useRef(false)
  const accountContext = useRef<AccountContext | null>(null)
  const [sessionChanged, setSessionChanged] = useState(false)
  const router = useRouter()

  const reload = useCallback(async (currentUserId: string, isCurrent: () => boolean) => {
    if (!isCurrent()) return
    const { data: auth, error: authError } = await supabase.auth.getSession()
    if (!isCurrent()) return
    if (authError || !auth.session || auth.session.user.id !== currentUserId) throw new Error("Sesión no disponible")
    const token = auth.session.access_token
    const profiles = await fetchMyProfiles(currentUserId, token)
    if (!isCurrent()) return
    const groups = profiles.filter(profile => profile.isBand)

    const owned = await Promise.all(
      groups.map(async (g) => {
        const members = g.role === "owner" ? await fetchBandMembers(g.id, token) : []
        return {
          id: g.id,
          displayName: g.displayName,
          role: g.role,
          activeMembers: members.filter((m) => m.status === "accepted").length,
        }
      })
    )
    if (!isCurrent()) return
    const invites = await fetchMyPendingInvites(currentUserId, token)
    if (!isCurrent()) return
    setOwnedGroups(owned)
    setPendingInvites(invites)
  }, [])

  // Lectura de la página para la cuenta leída de Auth. El estado inicial ya
  // marca "cargando"; los reintentos lo marcan antes de llamar (ver loadPage).
  // El contexto se captura antes de leer Auth para descartar respuestas tardías.
  const loadForAuth = useCallback(async (context: AccountContext | null, auth: AuthRead) => {
    const isCurrent = () => accountContext.current === context && !!context?.active && !context.invalidated
    if (!isCurrent()) return
    try {
      if (!auth.ok) throw new Error("Sesión no disponible")
      const user = auth.user
      if (!user) {
        router.push("/login")
        return
      }
      if (context!.owner !== undefined && context!.owner !== user.id) throw new Error("Sesión no disponible")
      context!.owner = user.id
      setUserId(user.id)
      await reload(user.id, isCurrent)
      if (!isCurrent()) return
      setRequiresReload(false)
    } catch {
      if (!isCurrent()) return
      setErrorMessage("No se pudo cargar la información de tus grupos. Inténtalo de nuevo.")
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [router, reload])

  const loadPage = useCallback(async () => {
    const context = accountContext.current
    if (!context?.active || context.invalidated) return
    setLoading(true)
    setErrorMessage("")
    await loadForAuth(context, await readAuth())
  }, [loadForAuth])

  useEffect(() => {
    const context = { active: true, invalidated: false, owner: undefined as string | null | undefined }
    accountContext.current = context
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!context.active || context.invalidated) return
      const owner = session?.user.id ?? null
      if (context.owner !== undefined && context.owner !== owner) {
        context.invalidated = true
        setUserId(null)
        setOwnedGroups([])
        setPendingInvites([])
        setSuccessMessage("")
        setErrorMessage("")
        setSessionChanged(true)
        setLoading(false)
      }
      context.owner = owner
    })
    async function loadOnMount() {
      await loadForAuth(context, await readAuth())
    }
    void loadOnMount()
    return () => { context.active = false; listener.subscription.unsubscribe() }
  }, [loadForAuth])

  const handleRetry = () => void loadPage()

  const handleInviteResponse = async (membershipId: string, decision: "accepted" | "declined") => {
    if (!userId || respondingRef.current || requiresReload) return
    const context = accountContext.current
    const isCurrent = () => accountContext.current === context && !!context?.active && !context.invalidated && context.owner === userId
    if (!isCurrent()) return
    respondingRef.current = true
    setRespondingTo(membershipId)
    setErrorMessage("")
    setSuccessMessage("")
    try {
      await respondToInvite(membershipId, decision, userId)
      if (!isCurrent()) { respondingRef.current = false; return }
    } catch {
      if (!isCurrent()) { respondingRef.current = false; return }
      setRequiresReload(true)
      setErrorMessage("No se pudo confirmar la respuesta. Recarga la información antes de volver a intentarlo.")
      respondingRef.current = false
      setRespondingTo(null)
      return
    }

    setSuccessMessage(decision === "accepted" ? "Invitación aceptada." : "Invitación rechazada.")
    try {
      await reload(userId, isCurrent)
    } catch {
      if (!isCurrent()) return
      setRequiresReload(true)
      setErrorMessage("La respuesta se guardó, pero no se pudo actualizar la lista. Recarga la información para continuar.")
    } finally {
      respondingRef.current = false
      if (isCurrent()) setRespondingTo(null)
    }
  }

  const handleEditContent = (groupId: string) => {
    if (!userId || !accountContext.current?.active || accountContext.current.invalidated || accountContext.current.owner !== userId) return
    setActiveBandId(userId, groupId)
    router.push("/dashboard")
  }

  if (sessionChanged) {
    return <LayoutAdmin><main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">La cuenta cambió</h1>
      <p role="status">Cerramos los grupos y las invitaciones de la cuenta anterior. Si habías enviado una respuesta, revisa su estado al volver a esa cuenta.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-4">Cargar la cuenta actual</button>
    </main></LayoutAdmin>
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          Cargando grupos…
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    )
  }

  return (
    <LayoutAdmin>
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
        <header className="gradient-border relative rounded-2xl bg-card/40 p-6 sm:p-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3.5" />
            Página de empresa
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground sm:text-3xl">
            Tus grupos musicales
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Como una página de negocio: varios integrantes, un solo perfil, gestionado en equipo. Crea la
            página de tu grupo, invita a tus compañeros con un rol y edítenla juntos.
          </p>
          <Link
            href="/grupo/nuevo"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Crear grupo musical
          </Link>
        </header>

        {errorMessage && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{errorMessage}</p>
            <button type="button" onClick={handleRetry} disabled={loading || respondingTo !== null} className="mt-2 min-h-11 font-semibold underline disabled:opacity-60">
              {loading ? "Actualizando…" : "Recargar información"}
            </button>
          </div>
        )}

        {successMessage && <p role="status" className="text-sm text-primary">{successMessage}</p>}

        {!errorMessage && pendingInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Invitaciones recibidas ({pendingInvites.length})
            </h2>
            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.membershipId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-4"
                >
                  <p className="text-sm text-foreground/90">
                    <span className="font-semibold text-foreground">{inv.bandDisplayName}</span> te invitó como{" "}
                    <span className="font-medium text-primary">{ROLE_LABELS[inv.role]}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "accepted")}
                      aria-label={`Aceptar invitación de ${inv.bandDisplayName}`}
                      disabled={respondingTo !== null || requiresReload}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-3 py-2 transition-opacity"
                    >
                      <Check className="size-3.5" /> {respondingTo === inv.membershipId ? "Guardando…" : "Aceptar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "declined")}
                      aria-label={`Rechazar invitación de ${inv.bandDisplayName}`}
                      disabled={respondingTo !== null || requiresReload}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-card hover:bg-destructive/10 border border-border text-muted-foreground hover:text-destructive text-xs font-bold px-3 py-2 transition-colors"
                    >
                      <XIcon className="size-3.5" /> {respondingTo === inv.membershipId ? "Guardando…" : "Rechazar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!errorMessage && <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tus grupos ({ownedGroups.length})
          </h2>
          {ownedGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center">
              <p className="text-sm text-muted-foreground">Todavía no formas parte de ningún grupo musical. Puedes crear uno o aceptar una invitación.</p>
              <Link
                href="/grupo/nuevo"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Crear el primero <ArrowRight className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {ownedGroups.map((group) => (
                <div
                  key={group.id}
                  className="gradient-border gradient-border-static relative rounded-2xl bg-card/40 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary/25 via-card to-background font-display text-lg font-bold text-primary">
                      {group.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-bold text-foreground">
                        {group.displayName}
                      </h3>
                      {group.role === "owner" && <p className="text-xs text-muted-foreground">
                        {group.activeMembers + 1} integrante{group.activeMembers === 0 ? "" : "s"}
                      </p>}
                      <p className="text-xs text-primary">{group.role === "owner" ? "Propietario" : ROLE_LABELS[group.role]}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/grupo/${group.id}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Users className="size-3.5" /> Panel del grupo
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleEditContent(group.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent/40"
                    >
                      <Pencil className="size-3.5" /> Editar página
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>}
      </div>
    </LayoutAdmin>
  )
}

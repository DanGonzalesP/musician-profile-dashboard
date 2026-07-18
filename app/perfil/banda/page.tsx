"use client"

// Lista "Mis grupos musicales" + invitaciones recibidas. La CREACIÓN vive en
// el asistente propio (/grupo/nuevo, estilo "crear página de empresa") y la
// GESTIÓN de cada grupo en su panel (/grupo/[id]) — esta página solo lista.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import LayoutAdmin from "@/components/LayoutAdmin"
import {
  fetchBandMembers,
  fetchMyPendingInvites,
  respondToInvite,
  setActiveBandId,
  type PendingInvite,
} from "@/lib/bands"
import { ArrowRight, Check, Loader2, Pencil, Plus, Sparkles, Users, X as XIcon } from "lucide-react"

type OwnedGroup = { id: string; displayName: string; activeMembers: number }

const ROLE_LABELS: Record<"admin" | "editor", string> = {
  admin: "Administrador",
  editor: "Editor",
}

export default function GruposPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const router = useRouter()

  async function reload(currentUserId: string) {
    const { data: groups, error: groupsError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("owner_user_id", currentUserId)
      .eq("profile_type", "band")

    if (groupsError) {
      setErrorMessage(groupsError.message)
      return
    }

    const owned = await Promise.all(
      (groups ?? []).map(async (g) => {
        const members = await fetchBandMembers(g.id as string)
        return {
          id: g.id as string,
          displayName: (g.display_name as string) || "Grupo sin nombre",
          activeMembers: members.filter((m) => m.status === "accepted").length,
        }
      })
    )
    setOwnedGroups(owned)
    setPendingInvites(await fetchMyPendingInvites(currentUserId))
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      try {
        await reload(user.id)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "No se pudo cargar la información de tus grupos.")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  const handleInviteResponse = async (membershipId: string, decision: "accepted" | "declined") => {
    if (!userId) return
    try {
      await respondToInvite(membershipId, decision)
      await reload(userId)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo responder la invitación.")
    }
  }

  const handleEditContent = (groupId: string) => {
    if (!userId) return
    setActiveBandId(userId, groupId)
    router.push("/dashboard")
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-muted-foreground">
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
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {pendingInvites.length > 0 && (
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
                      className="flex items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-3 py-2 transition-opacity"
                    >
                      <Check className="size-3.5" /> Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "declined")}
                      className="flex items-center gap-1.5 rounded-lg bg-card hover:bg-destructive/10 border border-border text-muted-foreground hover:text-destructive text-xs font-bold px-3 py-2 transition-colors"
                    >
                      <XIcon className="size-3.5" /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tus grupos ({ownedGroups.length})
          </h2>
          {ownedGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center">
              <p className="text-sm text-muted-foreground">Todavía no creaste ningún grupo musical.</p>
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
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 via-card to-background font-display text-lg font-bold text-primary">
                      {group.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-bold text-foreground">
                        {group.displayName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {group.activeMembers + 1} integrante{group.activeMembers === 0 ? "" : "s"}
                      </p>
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
        </section>
      </div>
    </LayoutAdmin>
  )
}

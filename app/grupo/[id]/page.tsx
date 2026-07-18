"use client"

// Panel de gestión de UN grupo musical — equivalente al panel personal pero
// con otra distribución: cabecera hero con la identidad del grupo + una
// grilla de tarjetas (integrantes, identidad, accesos rápidos), sin sidebar.
// La edición del CONTENIDO de la página sigue siendo el editor de bloques
// (/dashboard) con este grupo activo en el switcher.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BarChart3,
  Check,
  Crown,
  ExternalLink,
  Loader2,
  Mail,
  Music2,
  Palette,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
  X as XIcon,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  fetchBandMembers,
  getEffectiveBandRole,
  inviteMember,
  removeMember,
  setActiveBandId,
  updateMemberRole,
  type BandMember,
  type BandRole,
} from "@/lib/bands"
import { Logo } from "@/components/logo"

const ROLE_LABELS: Record<"admin" | "editor", string> = {
  admin: "Administrador",
  editor: "Editor",
}

export default function GrupoPanelPage() {
  const params = useParams<{ id: string }>()
  const groupId = params.id
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<BandRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  const [name, setName] = useState("")
  const [bio, setBio] = useState("")
  const [members, setMembers] = useState<BandMember[]>([])

  const [editingIdentity, setEditingIdentity] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [draftBio, setDraftBio] = useState("")
  const [savingIdentity, setSavingIdentity] = useState(false)

  const [inviteUsername, setInviteUsername] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "editor">("editor")
  const [inviting, setInviting] = useState(false)

  const reload = useCallback(async () => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, bio")
      .eq("id", groupId)
      .maybeSingle()
    if (error) throw error
    setName(profile?.display_name ?? "")
    setBio(profile?.bio ?? "")
    setMembers(await fetchBandMembers(groupId))
  }, [groupId])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      try {
        const role = await getEffectiveBandRole(groupId, user.id)
        if (!role) {
          // Sin vínculo con este grupo: de vuelta a la lista.
          router.push("/perfil/banda")
          return
        }
        setMyRole(role)
        await reload()
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "No se pudo cargar el grupo.")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [groupId, reload, router])

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-")
  const activeMembers = members.filter((m) => m.status === "accepted")
  const pendingMembers = members.filter((m) => m.status === "pending")
  const canManage = myRole === "owner" || myRole === "admin"

  const handleEditPage = () => {
    if (!userId) return
    setActiveBandId(userId, groupId)
    router.push("/dashboard")
  }

  const handleSaveIdentity = async () => {
    if (!draftName.trim()) return
    setSavingIdentity(true)
    setErrorMessage("")
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: draftName.trim(), bio: draftBio.trim() })
        .eq("id", groupId)
      if (error) throw error
      setEditingIdentity(false)
      await reload()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ""
      setErrorMessage(
        raw.includes("row-level security") || raw === ""
          ? "Supabase rechazó el cambio. Si acabas de actualizar la app, corre supabase/fix_group_creation_rls.sql."
          : raw
      )
    } finally {
      setSavingIdentity(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return
    setInviting(true)
    setErrorMessage("")
    try {
      await inviteMember(groupId, inviteUsername, inviteRole)
      setInviteUsername("")
      await reload()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo enviar la invitación.")
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMember(membershipId)
      await reload()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo quitar al integrante.")
    }
  }

  const handleRoleChange = async (membershipId: string, role: "admin" | "editor") => {
    try {
      await updateMemberRole(membershipId, role)
      await reload()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo cambiar el rol.")
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-16 text-foreground">
      {/* Barra superior liviana */}
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/perfil/banda"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Mis grupos
        </Link>
      </header>

      {/* Hero de identidad */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_55%)]"
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-5">
            <span className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/30 via-card to-background font-display text-3xl font-bold text-primary shadow-2xl sm:size-24">
              {name ? name.charAt(0).toUpperCase() : <Music2 className="size-9" />}
            </span>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Users className="size-3" /> Grupo musical
              </span>
              <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
                {name || "Grupo sin nombre"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeMembers.length + 1} integrante{activeMembers.length === 0 ? "" : "s"} ·{" "}
                {myRole === "owner" ? "Eres el propietario" : `Tu rol: ${myRole === "admin" ? "Administrador" : "Editor"}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEditPage}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Palette className="size-4" /> Editar página
            </button>
            {slug && (
              <Link
                href={`/${slug}`}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-accent/40"
              >
                <ExternalLink className="size-4" /> Ver página pública
              </Link>
            )}
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="mx-auto mt-2 w-full max-w-6xl px-6">
          <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        </div>
      )}

      {/* Grilla del panel — distribución lateral, no vertical */}
      <div className="mx-auto mt-6 grid w-full max-w-6xl gap-5 px-6 lg:grid-cols-3">
        {/* Integrantes — ocupa 2 columnas */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="gradient-border relative rounded-2xl bg-card/40 p-5 sm:p-6 lg:col-span-2"
        >
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="size-3.5 text-primary" /> Integrantes
          </h2>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {/* Propietario siempre visible */}
            <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Crown className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{myRole === "owner" ? "Tú" : "Propietario"}</p>
                <p className="text-[11px] text-muted-foreground">Propietario del grupo</p>
              </div>
            </div>

            {members.map((m) => (
              <div
                key={m.membershipId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/50 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.displayName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 text-amber-500">
                          <Mail className="size-3" /> Invitación pendiente
                        </span>
                      ) : m.status === "declined" ? (
                        <span className="text-destructive">Rechazó la invitación</span>
                      ) : (
                        ROLE_LABELS[m.role]
                      )}
                    </p>
                  </div>
                </div>
                {myRole === "owner" && (
                  <div className="flex shrink-0 items-center gap-1">
                    {m.status === "accepted" && (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.membershipId, e.target.value as "admin" | "editor")}
                        aria-label={`Rol de ${m.displayName}`}
                        className="rounded-lg border border-input bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(m.membershipId)}
                      title="Quitar del grupo"
                      aria-label={`Quitar a ${m.displayName}`}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {pendingMembers.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {pendingMembers.length} invitación{pendingMembers.length === 1 ? "" : "es"} sin responder.
            </p>
          )}

          {myRole === "owner" && (
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="@usuario a invitar"
                className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "editor")}
                className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none"
              >
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
              <button
                type="button"
                disabled={inviting || !inviteUsername.trim()}
                onClick={handleInvite}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Invitar
              </button>
            </div>
          )}
        </motion.section>

        {/* Identidad */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Shield className="size-3.5 text-primary" /> Identidad
            </h2>
            {canManage && !editingIdentity && (
              <button
                type="button"
                onClick={() => {
                  setDraftName(name)
                  setDraftBio(bio)
                  setEditingIdentity(true)
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Pencil className="size-3" /> Editar
              </button>
            )}
          </div>

          {editingIdentity ? (
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Nombre del grupo"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <textarea
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
                rows={4}
                placeholder="Descripción / biografía del grupo"
                className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveIdentity}
                  disabled={savingIdentity || !draftName.trim()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {savingIdentity ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingIdentity(false)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  <XIcon className="size-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre</p>
                <p className="mt-0.5 text-sm font-semibold">{name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descripción</p>
                <p className="mt-0.5 text-sm leading-relaxed text-foreground/85">
                  {bio || "Sin descripción todavía."}
                </p>
              </div>
              {slug && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">URL pública</p>
                  <p className="mt-0.5 truncate text-sm text-primary">/{slug}</p>
                </div>
              )}
            </div>
          )}
        </motion.section>

        {/* Accesos rápidos — fila completa en 3 tarjetas */}
        {[
          {
            icon: Palette,
            title: "Editor de la página",
            body: "Bloques, fotos, música, trayectoria y publicaciones del grupo.",
            onClick: handleEditPage,
          },
          {
            icon: BarChart3,
            title: "Métricas",
            body: "Visitas y actividad de la página (panel general).",
            href: "/perfil/dashboard",
          },
          {
            icon: Check,
            title: "Invitaciones",
            body: "Las invitaciones enviadas aparecen aquí y en el panel de cada invitado.",
            href: "/perfil/banda",
          },
        ].map((card, i) => {
          const Icon = card.icon
          const inner = (
            <>
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">{card.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{card.body}</p>
              </div>
            </>
          )
          const className =
            "flex items-start gap-3.5 rounded-2xl border border-border bg-card/40 p-5 text-left transition-colors hover:border-primary/40 hover:bg-card/70"
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 + i * 0.06 }}
            >
              {card.href ? (
                <Link href={card.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={card.onClick} className={`${className} w-full`}>
                  {inner}
                </button>
              )}
            </motion.div>
          )
        })}
      </div>
    </main>
  )
}

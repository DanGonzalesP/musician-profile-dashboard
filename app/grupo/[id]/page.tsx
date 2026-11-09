"use client"

// Panel de gestión de UN grupo musical — equivalente al panel personal pero
// con otra distribución: cabecera hero con la identidad del grupo + una
// grilla de tarjetas (integrantes, identidad, accesos rápidos), sin sidebar.
// La edición del CONTENIDO de la página sigue siendo el editor de bloques
// (/dashboard) con este grupo activo en el switcher.

import { useCallback, useEffect, useRef, useState } from "react"
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
import { revalidarPerfilPublico } from "@/app/acciones/revalidar-perfil"

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
  const [statusMessage, setStatusMessage] = useState("")
  const [loadFailed, setLoadFailed] = useState(false)
  const [requiresReload, setRequiresReload] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const actionLock = useRef(false)
  const accountContext = useRef<{ active: boolean; invalidated: boolean; owner: string | null | undefined } | null>(null)
  const [sessionChanged, setSessionChanged] = useState(false)
  const formGroupId = useRef<string | null>(null)
  const [slug, setSlug] = useState("")

  const [name, setName] = useState("")
  const [bio, setBio] = useState("")
  const [members, setMembers] = useState<BandMember[]>([])

  const [editingIdentity, setEditingIdentity] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [draftBio, setDraftBio] = useState("")
  const [savingIdentity, setSavingIdentity] = useState(false)
  const loadedIdentity = useRef<{ name: string | null; bio: string | null } | null>(null)
  const [editingIdentityBase, setEditingIdentityBase] = useState<{ name: string | null; bio: string | null } | null>(null)

  const [inviteUsername, setInviteUsername] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "editor">("editor")
  const [inviting, setInviting] = useState(false)
  const hasUnsavedIdentity = editingIdentity && (draftName !== (editingIdentityBase?.name ?? "") || draftBio !== (editingIdentityBase?.bio ?? ""))
  const hasUnsavedForm = hasUnsavedIdentity || Boolean(inviteUsername.trim())

  useEffect(() => {
    if (!hasUnsavedForm && !busy) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnBeforeLeaving)
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving)
  }, [hasUnsavedForm, busy])

  const reload = useCallback(async () => {
    const context = accountContext.current
    const isCurrent = () => accountContext.current === context && !!context?.active && !context.invalidated
    if (!isCurrent()) return
    const { data: auth, error: authError } = await supabase.auth.getSession()
    if (!isCurrent()) return
    if (authError || !auth.session || auth.session.user.id !== context!.owner) throw new Error("Sesión no disponible")
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, bio, username")
      .eq("id", groupId)
      .maybeSingle()
      .setHeader("Authorization", `Bearer ${auth.session.access_token}`)
    if (!isCurrent()) return
    if (error || !profile) throw new Error("Grupo no disponible")
    const loadedMembers = await fetchBandMembers(groupId, auth.session.access_token)
    if (!isCurrent()) return
    loadedIdentity.current = { name: profile.display_name, bio: profile.bio }
    setName(profile.display_name ?? "")
    setBio(profile.bio ?? "")
    setSlug(profile.username ?? "")
    setMembers(loadedMembers)
    setLoadFailed(false)
    setRequiresReload(false)
  }, [groupId])

  // Cambiar de grupo o reintentar inicia una carga nueva. El estado visible se
  // reinicia al renderizar (patrón de React ante cambio de props), no en el efecto.
  const [renderedLoad, setRenderedLoad] = useState({ groupId, retry })
  if (renderedLoad.groupId !== groupId || renderedLoad.retry !== retry) {
    if (renderedLoad.groupId !== groupId) {
      setEditingIdentity(false)
      setDraftName("")
      setDraftBio("")
      setInviteUsername("")
      setEditingIdentityBase(null)
    }
    setRenderedLoad({ groupId, retry })
    setBusy(false)
    setSavingIdentity(false)
    setInviting(false)
    setMyRole(null)
    setLoading(true)
  }

  useEffect(() => {
    const context = { active: true, invalidated: false, owner: undefined as string | null | undefined }
    accountContext.current = context
    actionLock.current = false
    if (formGroupId.current !== groupId) {
      formGroupId.current = groupId
      loadedIdentity.current = null
    }
    const isCurrent = () => context.active && !context.invalidated && accountContext.current === context
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isCurrent()) return
      const owner = session?.user.id ?? null
      if (context.owner !== undefined && context.owner !== owner) {
        context.invalidated = true
        setUserId(null)
        setMyRole(null)
        setMembers([])
        setName("")
        setBio("")
        setSlug("")
        setInviteUsername("")
        setStatusMessage("")
        setErrorMessage("")
        setSessionChanged(true)
        setLoading(false)
      }
      context.owner = owner
    })
    async function init() {
      try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!isCurrent()) return
      if (authError) throw authError
      if (!user) {
        router.push("/login")
        return
      }
      if (context.owner !== undefined && context.owner !== user.id) throw new Error("Sesión no disponible")
      context.owner = user.id
      setUserId(user.id)
        const { data: auth, error: sessionError } = await supabase.auth.getSession()
        if (!isCurrent()) return
        if (sessionError || !auth.session || auth.session.user.id !== user.id) throw new Error("Sesión no disponible")
        const role = await getEffectiveBandRole(groupId, user.id, auth.session.access_token)
        if (!isCurrent()) return
        if (!role) {
          // Sin vínculo con este grupo: de vuelta a la lista.
          router.push("/perfil/banda")
          return
        }
        setMyRole(role)
        await reload()
      } catch {
        if (!isCurrent()) return
        setLoadFailed(true)
        setErrorMessage("No pudimos cargar el grupo. Revisa tu conexión e inténtalo de nuevo.")
      } finally {
        if (isCurrent()) setLoading(false)
      }
    }
    init()
    return () => { context.active = false; listener.subscription.unsubscribe() }
  }, [groupId, reload, router, retry])

  const activeMembers = members.filter((m) => m.status === "accepted")
  const pendingMembers = members.filter((m) => m.status === "pending")
  const canManage = myRole === "owner" || myRole === "admin"
  const disabled = busy || requiresReload || loadFailed || sessionChanged

  const handleEditPage = () => {
    if (!userId || disabled) return
    if (hasUnsavedForm && !window.confirm("Hay cambios sin guardar en este panel. ¿Salir al editor y descartarlos?")) return
    setActiveBandId(userId, groupId)
    router.push("/dashboard")
  }

  async function performChange(action: (token: string, isCurrent: () => boolean, owner: string) => Promise<void>, success: string) {
    if (actionLock.current || disabled) return
    const context = accountContext.current
    const isCurrent = () => accountContext.current === context && !!context?.active && !context.invalidated
    if (!isCurrent()) return
    actionLock.current = true
    setBusy(true)
    setErrorMessage("")
    setStatusMessage("")
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession()
      if (!isCurrent()) return
      if (authError || !auth.session || auth.session.user.id !== context!.owner) throw new Error("Sesión no disponible")
      await action(auth.session.access_token, isCurrent, auth.session.user.id)
      if (!isCurrent()) return
      setStatusMessage(success)
      try {
        await reload()
      } catch {
        if (!isCurrent()) return
        setRequiresReload(true)
        setErrorMessage("El cambio se guardó, pero no pudimos actualizar el panel. Recarga la información; no repitas la operación.")
      }
    } catch {
      if (!isCurrent()) return
      setRequiresReload(true)
      setErrorMessage("No pudimos confirmar el cambio. Puede haberse modificado desde otra sesión. Recarga la información antes de repetir; si estabas editando la identidad, conserva tus cambios y vuelve a abrir el formulario con los datos actuales.")
    } finally {
      if (accountContext.current === context) actionLock.current = false
      if (isCurrent()) {
        setBusy(false)
        setSavingIdentity(false)
        setInviting(false)
      }
    }
  }

  const handleSaveIdentity = async () => {
    if (!draftName.trim() || !canManage || disabled || actionLock.current) return
    const baseline = editingIdentityBase
    if (!baseline) return
    setSavingIdentity(true)
    await performChange(async (token, isCurrent) => {
      const query = supabase.from("profiles")
        .update({ display_name: draftName.trim(), bio: draftBio.trim() })
        .eq("id", groupId).eq("profile_type", "band").select("id")
        .setHeader("Authorization", `Bearer ${token}`)
      // Compare the values present when this form opened, including SQL null.
      // Reloading the panel must not silently approve stale draft values.
      if (baseline.name === null) query.is("display_name", null)
      else query.eq("display_name", baseline.name)
      if (baseline.bio === null) query.is("bio", null)
      else query.eq("bio", baseline.bio)
      const { data, error } = await query.single()
      if (!isCurrent()) return
      if (error || !data) throw new Error("Cambio no confirmado")
      setEditingIdentity(false)
      try {
        if (slug && !await revalidarPerfilPublico(slug)) {
          if (!isCurrent()) return
          setErrorMessage("La identidad se guardó; la actualización de la página pública está pendiente.")
        }
      } catch {
        if (!isCurrent()) return
        setErrorMessage("La identidad se guardó; la actualización de la página pública está pendiente.")
      }
    }, "Identidad del grupo guardada.")
  }

  const handleInvite = async () => {
    if (!inviteUsername.trim() || myRole !== "owner" || disabled || actionLock.current) return
    setInviting(true)
    await performChange(async (_token, isCurrent, owner) => {
      await inviteMember(groupId, inviteUsername, inviteRole, owner)
      if (!isCurrent()) return
      setInviteUsername("")
    }, "Invitación registrada.")
  }

  const handleRemove = async (membershipId: string) => {
    if (myRole !== "owner" || disabled || actionLock.current) return
    const previous = members.find(member => member.membershipId === membershipId)
    if (!previous) return
    if (!window.confirm("¿Quitar a esta persona del grupo? Perderá su acceso a la gestión de esta página.")) return
    await performChange((_token, _isCurrent, owner) => removeMember(membershipId, groupId, owner, previous), "Integrante retirado del grupo.")
  }

  const handleRoleChange = async (membershipId: string, role: "admin" | "editor") => {
    if (myRole !== "owner" || disabled) return
    const previous = members.find(member => member.membershipId === membershipId)
    if (!previous || previous.status !== "accepted" || previous.role === role) return
    await performChange((_token, _isCurrent, owner) => updateMemberRole(membershipId, role, groupId, owner, previous.role), "Rol del integrante actualizado.")
  }
  if (sessionChanged) {
    return <main className="mx-auto max-w-xl space-y-4 p-6 text-foreground">
      <h1 className="text-xl font-bold">La cuenta cambió</h1>
      <p role="alert">Detuvimos la gestión del grupo. Una operación ya enviada puede haberse guardado; revisa su estado con la cuenta original antes de repetirla.</p>
      <button type="button" onClick={() => {
        if (window.confirm("¿Recargar el grupo? Se perderán los cambios del formulario sin guardar.")) window.location.reload()
      }} className="min-h-11 rounded-lg border px-4">Volver a cargar el grupo</button>
    </main>
  }

  if (loading) {
    return (
      <main role="status" className="flex min-h-dvh items-center justify-center gap-3 bg-background">
        Cargando grupo…
        <Loader2 className="size-8 animate-spin text-primary" />
      </main>
    )
  }

  if (loadFailed || !myRole) {
    return <main className="mx-auto max-w-xl space-y-4 p-6 text-foreground">
      <h1 className="text-xl font-bold">Grupo no disponible</h1>
      <p role="alert">{errorMessage || "No pudimos acceder a este grupo."}</p>
      <button type="button" onClick={() => { setLoading(true); setErrorMessage(""); setRetry(value => value + 1) }} className="min-h-11 rounded-lg border px-4">Reintentar</button>
      <Link href="/perfil/banda" className="block text-primary underline">Volver a mis grupos</Link>
    </main>
  }

  return (
    <main className="min-h-dvh bg-background pb-16 text-foreground">
      {/* Barra superior liviana */}
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/perfil/banda"
          onClick={event => {
            if (busy || (hasUnsavedForm && !window.confirm("¿Volver a tus grupos y descartar los cambios sin guardar?"))) event.preventDefault()
          }}
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
            <span className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-primary/30 bg-linear-to-br from-primary/30 via-card to-background font-display text-3xl font-bold text-primary shadow-2xl sm:size-24">
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
                {myRole === "owner" && <>{activeMembers.length + 1} integrante{activeMembers.length === 0 ? "" : "s"} · </>}
                {myRole === "owner" ? "Eres el propietario" : `Tu rol: ${myRole === "admin" ? "Administrador" : "Editor"}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEditPage}
              disabled={disabled}
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
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
          <button type="button" disabled={busy} onClick={() => { setLoading(true); setErrorMessage(""); setRetry(value => value + 1) }} className="mt-2 min-h-11 rounded-lg border px-4">Recargar información</button>
        </div>
      )}
      <p role="status" className="mx-auto max-w-6xl px-6 text-sm">{busy ? "Guardando cambio…" : statusMessage}</p>

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
          {myRole !== "owner" && <p className="mt-2 text-xs text-muted-foreground">Aquí se muestra tu participación. El propietario administra la lista completa del grupo.</p>}

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
                        disabled={disabled}
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.membershipId, e.target.value as "admin" | "editor")}
                        aria-label={`Rol de ${m.displayName}`}
                        className="min-h-11 rounded-lg border border-input bg-background px-1.5 py-1 text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(m.membershipId)}
                      disabled={disabled}
                      title="Quitar del grupo"
                      aria-label={`Quitar a ${m.displayName}`}
                      className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
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
                aria-label="Usuario a invitar"
                disabled={disabled}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="@usuario a invitar"
                className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={inviteRole}
                aria-label="Rol de la persona invitada"
                disabled={disabled}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "editor")}
                className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none"
              >
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
              <button
                type="button"
                disabled={disabled || !inviteUsername.trim()}
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
                disabled={disabled}
                onClick={() => {
                  if (!loadedIdentity.current) return
                  setEditingIdentityBase({ ...loadedIdentity.current })
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
                disabled={disabled}
                aria-label="Nombre del grupo"
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Nombre del grupo"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <textarea
                value={draftBio}
                disabled={disabled}
                aria-label="Descripción del grupo"
                onChange={(e) => setDraftBio(e.target.value)}
                rows={4}
                placeholder="Descripción / biografía del grupo"
                className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveIdentity}
                  disabled={disabled || !draftName.trim()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {savingIdentity ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!hasUnsavedIdentity || window.confirm("¿Descartar los cambios de nombre y descripción sin guardar?")) setEditingIdentity(false)
                  }}
                  disabled={busy}
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
                <button type="button" disabled={disabled} onClick={card.onClick} className={`${className} w-full`}>
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

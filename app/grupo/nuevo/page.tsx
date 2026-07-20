"use client"

// Asistente de creación de un grupo musical — flujo tipo "crear página de
// empresa" de Facebook/Instagram: pantalla propia a pantalla completa (no
// dentro del panel admin), pasos cortos con vista previa en vivo al costado.
// Paso 1: nombre → Paso 2: descripción → Paso 3: invitar integrantes → listo.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Music2,
  PartyPopper,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { createBand, inviteMember, setActiveBandId } from "@/lib/bands"
import { Logo } from "@/components/logo"

type PendingInvitation = { username: string; role: "admin" | "editor" }

const STEPS = [
  { title: "Nombre", subtitle: "¿Cómo se llama tu grupo?" },
  { title: "Identidad", subtitle: "Cuéntale al mundo quiénes son" },
  { title: "Integrantes", subtitle: "Invita a tu equipo (opcional)" },
] as const

export default function NuevoGrupoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [inviteUsername, setInviteUsername] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "editor">("editor")

  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [inviteWarnings, setInviteWarnings] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
    })
  }, [router])

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  const addInvitation = () => {
    const clean = inviteUsername.trim().replace(/^@/, "")
    if (!clean) return
    if (invitations.some((i) => i.username.toLowerCase() === clean.toLowerCase())) {
      setInviteUsername("")
      return
    }
    setInvitations((prev) => [...prev, { username: clean, role: inviteRole }])
    setInviteUsername("")
  }

  const handleCreate = async () => {
    if (!userId || !name.trim()) return
    setCreating(true)
    setErrorMessage("")
    const warnings: string[] = []
    try {
      const groupId = await createBand(userId, name.trim())

      if (description.trim()) {
        // La bio es opcional: si falla (ej. falta correr la migración de RLS),
        // el grupo ya existe y no se bloquea el flujo.
        const { error: bioError } = await supabase
          .from("profiles")
          .update({ bio: description.trim() })
          .eq("id", groupId)
        if (bioError) warnings.push("No se pudo guardar la descripción — puedes editarla luego en el editor.")
      }

      for (const inv of invitations) {
        try {
          await inviteMember(groupId, inv.username, inv.role)
        } catch (err) {
          warnings.push(
            err instanceof Error ? err.message : `No se pudo invitar a @${inv.username}.`
          )
        }
      }

      setInviteWarnings(warnings)
      setCreatedGroupId(groupId)
    } catch (err) {
      // Los errores de Supabase (PostgrestError) no son instancias de Error,
      // así que había que leer .message directo del objeto o se perdía el
      // motivo real y siempre se mostraba el mensaje genérico de abajo.
      const raw =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : ""
      // El error típico de RLS de Supabase es críptico — se traduce a algo accionable.
      setErrorMessage(
        raw.includes("row-level security")
          ? "Supabase rechazó la creación del grupo. Falta correr supabase/setup_vibra.sql en el proyecto (una sola vez, desde el SQL Editor)."
          : raw || "No se pudo crear el grupo musical. Intenta de nuevo."
      )
    } finally {
      setCreating(false)
    }
  }

  const handleGoToEditor = () => {
    if (userId && createdGroupId) setActiveBandId(userId, createdGroupId)
    router.push("/dashboard")
  }

  const canContinue = step === 0 ? name.trim().length >= 2 : true

  // ── Pantalla de éxito ────────────────────────────────────────────────────
  if (createdGroupId) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6">
        <BackgroundGlow />
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="gradient-border relative w-full max-w-lg rounded-3xl bg-card/60 p-8 text-center backdrop-blur-xl sm:p-10"
        >
          <motion.span
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary"
          >
            <PartyPopper className="size-8" />
          </motion.span>
          <h1 className="mt-5 font-display text-2xl font-bold text-foreground sm:text-3xl">
            ¡{name.trim()} ya existe!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Tu grupo musical ya tiene su propia página. Ahora dale vida: agrega fotos, música y su
            trayectoria desde el editor.
          </p>

          {inviteWarnings.length > 0 && (
            <div className="mt-4 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-500">
              {inviteWarnings.map((w, i) => (
                <p key={i}>• {w}</p>
              ))}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleGoToEditor}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Pencil className="size-4" /> Personalizar la página
            </button>
            <Link
              href={`/grupo/${createdGroupId}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-accent/40"
            >
              <Users className="size-4" /> Ir al panel del grupo
            </Link>
          </div>
        </motion.div>
      </main>
    )
  }

  // ── Asistente ────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background">
      <BackgroundGlow />

      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver al feed
        </Link>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-start">
        {/* Columna izquierda: pasos */}
        <div>
          {/* Indicador de pasos */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => i < step && goTo(i)}
                className="group flex items-center gap-2"
                disabled={i > step}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "border-2 border-primary text-primary"
                        : "border border-border text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={`hidden text-xs font-medium sm:block ${
                    i === step ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.title}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-border sm:w-10" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div className="relative mt-8 min-h-[340px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.section
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 48 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -48 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Sparkles className="size-3.5" /> Nuevo grupo musical
                </span>
                <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
                  {STEPS[step].subtitle}
                </h1>

                {step === 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Es como crear la página de una empresa: el grupo tendrá su propio perfil público,
                      separado del tuyo, gestionado entre todos sus integrantes.
                    </p>
                    <input
                      type="text"
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canContinue && goTo(1)}
                      placeholder="Ej. Los Vientos del Sur"
                      className="w-full rounded-2xl border border-input bg-card/60 px-5 py-4 font-display text-xl font-bold text-foreground placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este será el nombre público de la página. Puedes cambiarlo después.
                    </p>
                  </div>
                )}

                {step === 1 && (
                  <div className="mt-6 space-y-3">
                    <textarea
                      autoFocus
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder="Ej. Cuarteto de cumbia y fusión andina desde Lima. Girando desde 2021."
                      className="w-full resize-none rounded-2xl border border-input bg-card/60 px-5 py-4 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Opcional — aparece como biografía en la página del grupo. Puedes saltarlo.
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="mt-6 space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Este paso es <strong className="text-foreground">totalmente opcional</strong>: puedes crear
                      el grupo tú solo ahora mismo e invitar integrantes cuando quieras desde el panel del grupo.
                      Si invitas a alguien, recibirá la invitación en su panel y, al aceptar, podrá editar la
                      página según su rol.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={inviteUsername}
                        onChange={(e) => setInviteUsername(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addInvitation()}
                        placeholder="@usuario"
                        className="flex-1 rounded-xl border border-input bg-card/60 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as "admin" | "editor")}
                        className="rounded-xl border border-input bg-card/60 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button
                        type="button"
                        onClick={addInvitation}
                        disabled={!inviteUsername.trim()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <Plus className="size-4" /> Añadir
                      </button>
                    </div>

                    {invitations.length > 0 && (
                      <ul className="space-y-2">
                        {invitations.map((inv) => (
                          <li
                            key={inv.username}
                            className="flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-2.5"
                          >
                            <span className="text-sm text-foreground">
                              @{inv.username}{" "}
                              <span className="text-xs text-muted-foreground">
                                — {inv.role === "admin" ? "Administrador" : "Editor"}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setInvitations((prev) => prev.filter((i) => i.username !== inv.username))
                              }
                              aria-label={`Quitar a ${inv.username}`}
                              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {errorMessage && (
                  <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {errorMessage}
                  </p>
                )}

                <div className="mt-8 flex items-center gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={() => goTo(step - 1)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                    >
                      <ArrowLeft className="size-4" /> Atrás
                    </button>
                  )}
                  {step < STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => goTo(step + 1)}
                      disabled={!canContinue}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      Continuar <ArrowRight className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={creating || !name.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Creando…
                        </>
                      ) : (
                        <>
                          <Check className="size-4" />
                          {invitations.length === 0 ? "Crear grupo sin invitar a nadie" : "Crear grupo musical"}
                        </>
                      )}
                    </button>
                  )}
                  {step === 2 && invitations.length === 0 && !creating && (
                    <span className="text-xs text-muted-foreground">
                      Podrás invitar integrantes después.
                    </span>
                  )}
                </div>
              </motion.section>
            </AnimatePresence>
          </div>
        </div>

        {/* Columna derecha: vista previa en vivo de la página del grupo */}
        <motion.aside
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="hidden lg:block"
          aria-hidden="true"
        >
          <div className="gradient-border relative overflow-hidden rounded-3xl bg-card/50 backdrop-blur-xl">
            <div className="h-28 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--primary)_45%,transparent),transparent_65%)]" />
            <div className="-mt-10 px-6 pb-6">
              <span className="flex size-20 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/30 via-card to-background font-display text-2xl font-bold text-primary shadow-xl">
                {name.trim() ? name.trim().charAt(0).toUpperCase() : <Music2 className="size-8" />}
              </span>
              <p className="mt-4 font-display text-xl font-bold text-foreground">
                {name.trim() || "Tu grupo musical"}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Users className="size-3" /> Grupo musical
              </span>
              <p className="mt-3 min-h-10 text-xs leading-relaxed text-muted-foreground">
                {description.trim() || "Aquí aparecerá la descripción del grupo."}
              </p>
              {invitations.length > 0 && (
                <div className="mt-4 flex -space-x-2">
                  {invitations.slice(0, 5).map((inv) => (
                    <span
                      key={inv.username}
                      title={`@${inv.username}`}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-[11px] font-bold text-foreground"
                    >
                      {inv.username.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">Vista previa de la página</p>
        </motion.aside>
      </div>
    </main>
  )
}

function BackgroundGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-[100px]" />
    </div>
  )
}

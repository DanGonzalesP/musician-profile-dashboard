"use client"

import { useRef, useState, type MouseEvent, type ReactNode } from "react"
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion"
import {
  Calendar,
  Disc3,
  MapPin,
  Quote,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { LegadoData, LegadoMember, LegadoMilestone } from "@/lib/blocks"

// ---------------------------------------------------------------------------
// Tilt 3D — usado en las tarjetas de la trayectoria
// ---------------------------------------------------------------------------

function TiltCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), {
    stiffness: 300,
    damping: 30,
  })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), {
    stiffness: 300,
    damping: 30,
  })

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (reduceMotion || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  function handleMouseLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        reduceMotion
          ? undefined
          : { rotateX, rotateY, transformPerspective: 800 }
      }
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Scroll reveal — fade + translateY al entrar en viewport, una sola vez
// ---------------------------------------------------------------------------

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: reduceMotion ? 0.3 : 0.6,
        ease: "easeOut",
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Eyebrow — etiqueta pequeña de sección
// ---------------------------------------------------------------------------

function Eyebrow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Imagen con fallback en degradado si falta la URL
// ---------------------------------------------------------------------------

function ImageOrPlaceholder({
  src,
  alt,
  className,
}: {
  src?: string
  alt: string
  className?: string
}) {
  if (!src) {
    return (
      <div
        className={`bg-gradient-to-br from-primary/25 via-card to-background ${className ?? ""}`}
        aria-hidden="true"
      />
    )
  }
  return <img src={src} alt={alt} className={`object-cover ${className ?? ""}`} />
}

// ---------------------------------------------------------------------------
// Tarjeta de hito de trayectoria
// ---------------------------------------------------------------------------

function MilestoneCard({ milestone }: { milestone: LegadoMilestone }) {
  return (
    <TiltCard className="h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
        {milestone.image ? (
          <ImageOrPlaceholder
            src={milestone.image}
            alt={milestone.title}
            className="mb-4 h-36 w-full rounded-xl"
          />
        ) : null}
        <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <Calendar className="size-3.5" />
          {milestone.year}
        </span>
        <h3 className="font-display text-lg font-bold leading-snug text-foreground">
          {milestone.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {milestone.description}
        </p>
      </div>
    </TiltCard>
  )
}

// ---------------------------------------------------------------------------
// Flip card 3D de integrante de banda
// ---------------------------------------------------------------------------

function MemberCard({ member }: { member: LegadoMember }) {
  const [flipped, setFlipped] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="relative aspect-[3/4] w-full [perspective:1200px]"
      aria-label={`Ver más sobre ${member.name}`}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative size-full"
      >
        {/* frente: foto, nombre, rol */}
        <div
          style={{ backfaceVisibility: "hidden" }}
          className="absolute inset-0 overflow-hidden rounded-2xl border border-border bg-card/40"
        >
          <ImageOrPlaceholder src={member.photo} alt={member.name} className="h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent p-3 text-left">
            <p className="font-display text-sm font-bold text-foreground">{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.role}</p>
          </div>
        </div>

        {/* dorso: bio */}
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="absolute inset-0 flex flex-col justify-center overflow-y-auto rounded-2xl border border-primary/40 bg-card p-4 text-left"
        >
          <p className="font-display text-sm font-bold text-foreground">{member.name}</p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            {member.role}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {member.bio || "Sin biografía disponible."}
          </p>
        </div>
      </motion.div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function LegadoBlock({ data }: { data: LegadoData }) {
  const isEmpty =
    !data.headline &&
    !data.bio &&
    data.timeline.length === 0 &&
    data.gallery.length === 0

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        Todavía no hay información de trayectoria.
      </div>
    )
  }

  const hasBioSection = Boolean(data.bio) || data.genres.length > 0 || data.influences.length > 0

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      {/* Encabezado */}
      {data.headline ? (
        <Reveal>
          <div className="gradient-border relative rounded-2xl bg-card/40 p-6 sm:p-10">
            <Eyebrow icon={Sparkles}>Bitácora</Eyebrow>
            <Quote className="mt-4 size-8 text-primary/40 sm:size-10" />
            <p className="mt-2 max-w-3xl text-balance font-display text-2xl font-bold leading-tight text-foreground sm:text-4xl">
              {data.headline}
            </p>
          </div>
        </Reveal>
      ) : null}

      {/* Biografía */}
      {hasBioSection ? (
        <Reveal className="flex flex-col gap-6">
          {data.bio ? (
            <div className="max-w-prose">
              <Eyebrow icon={Disc3}>Biografía</Eyebrow>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-foreground/90">
                {data.bio}
              </p>
            </div>
          ) : null}

          {data.genres.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Géneros
              </p>
              <div className="flex flex-wrap gap-2">
                {data.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-border px-3 py-1 text-xs text-foreground/80"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.influences.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Influencias
              </p>
              <div className="flex flex-wrap gap-2">
                {data.influences.map((influence) => (
                  <span
                    key={influence}
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary"
                  >
                    {influence}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Reveal>
      ) : null}

      {/* Trayectoria */}
      {data.timeline.length > 0 ? (
        <div>
          <Reveal>
            <Eyebrow icon={Calendar}>Trayectoria</Eyebrow>
          </Reveal>
          <div className="relative mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.timeline.map((milestone, i) => (
              <Reveal key={milestone.id} delay={Math.min(i * 0.08, 0.4)}>
                <MilestoneCard milestone={milestone} />
              </Reveal>
            ))}
          </div>
        </div>
      ) : null}

      {/* Integrantes (oculto si es solista) */}
      {data.members.length > 0 ? (
        <div>
          <Reveal>
            <Eyebrow icon={Users}>Integrantes</Eyebrow>
          </Reveal>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.members.map((member, i) => (
              <Reveal key={member.id} delay={Math.min(i * 0.08, 0.4)}>
                <MemberCard member={member} />
              </Reveal>
            ))}
          </div>
        </div>
      ) : null}

      {/* Galería de referencia */}
      {data.gallery.length > 0 ? (
        <div>
          <Reveal>
            <Eyebrow icon={MapPin}>Galería</Eyebrow>
          </Reveal>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.gallery.map((url, i) => (
              <Reveal key={`${url}-${i}`} delay={Math.min(i * 0.05, 0.4)}>
                <div className="gradient-border gradient-border-static overflow-hidden rounded-xl">
                  <div className="aspect-square overflow-hidden rounded-xl">
                    <img
                      src={url}
                      alt={`Foto de referencia ${i + 1}`}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

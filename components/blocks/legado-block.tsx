"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
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
// Fila de hito de trayectoria — timeline horizontal (imagen + texto lado a
// lado). Desde md: alterna de lado sobre una línea central para aprovechar
// el ancho completo de la página; debajo de md: una sola columna, pero cada
// hito sigue siendo una fila (imagen a la izquierda, texto a la derecha).
// ---------------------------------------------------------------------------

function MilestoneRow({ milestone, index }: { milestone: LegadoMilestone; index: number }) {
  const reversed = index % 2 === 1

  const content = (
    <div
      className={`flex flex-1 flex-row items-center gap-4 sm:gap-6 ${
        reversed ? "md:flex-row-reverse" : ""
      }`}
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border sm:h-32 sm:w-32 md:h-40 md:w-40">
        <ImageOrPlaceholder src={milestone.image} alt={milestone.title} className="h-full w-full" />
      </div>
      <div className={`min-w-0 flex-1 ${reversed ? "md:text-right" : ""}`}>
        <span
          className={`mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ${
            reversed ? "md:flex-row-reverse" : ""
          }`}
        >
          <Calendar className="size-3.5" />
          {milestone.year}
        </span>
        <h3 className="font-display text-lg font-bold leading-snug text-foreground sm:text-xl">
          {milestone.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {milestone.description}
        </p>
      </div>
    </div>
  )

  // En mobile el spacer queda oculto (display:none) y no afecta el layout —
  // solo importa el orden en desktop, donde define de qué lado cae cada hito.
  const spacer = <div className="hidden md:block md:flex-1" aria-hidden="true" />

  return (
    <div className="relative flex md:items-center md:gap-8">
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background md:block"
      />
      {reversed ? spacer : content}
      {reversed ? content : spacer}
    </div>
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
            <Eyebrow icon={Sparkles}>Trayectoria</Eyebrow>
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
          <div className="relative mt-6">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-border md:block"
            />
            <div className="flex flex-col gap-10 md:gap-14">
              {data.timeline.map((milestone, i) => (
                <Reveal key={milestone.id} delay={Math.min(i * 0.08, 0.4)}>
                  <MilestoneRow milestone={milestone} index={i} />
                </Reveal>
              ))}
            </div>
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

"use client"

// Trayectoria — la carta de presentación del músico. Bento Grid que usa todo
// el ancho disponible en desktop (nada de una sola columna vertical), con
// tarjetas "3D depth": inclinación que sigue el cursor (rotateX/rotateY con
// springs de framer-motion), capas internas en translateZ y un brillo (glare)
// que persigue el mouse. La sección de integrantes ya no vive acá — eso es
// del panel del grupo musical; esta sección es 100% el perfil del artista.

import { useState, type ReactNode } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion"
import {
  Calendar,
  Disc3,
  Heart,
  MapPin,
  Music2,
  Quote,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import type { LegadoData, LegadoMilestone } from "@/lib/blocks"

// ---------------------------------------------------------------------------
// Reveal — fade + translateY al entrar en viewport, una sola vez
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
      transition={{ duration: reduceMotion ? 0.3 : 0.6, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// DepthCard — tarjeta 3D con inclinación y glare reactivos al cursor
// ---------------------------------------------------------------------------

function DepthCard({
  children,
  className = "",
  intensity = 9,
}: {
  children: ReactNode
  className?: string
  intensity?: number
}) {
  const reduceMotion = useReducedMotion()
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const springX = useSpring(rotateX, { stiffness: 220, damping: 20 })
  const springY = useSpring(rotateY, { stiffness: 220, damping: 20 })
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    rotateY.set(px * intensity)
    rotateX.set(-py * intensity)
    setGlare({ x: px * 100 + 50, y: py * 100 + 50, opacity: 1 })
  }

  const handleMouseLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
    setGlare((g) => ({ ...g, opacity: 0 }))
  }

  return (
    <div className={`group/depth [perspective:1200px] ${className}`}>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
        className="relative size-full will-change-transform"
      >
        {children}
        {/* Glare que sigue al cursor */}
        <div
          aria-hidden="true"
          style={{
            opacity: glare.opacity,
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, color-mix(in oklch, var(--foreground) 14%, transparent), transparent 55%)`,
          }}
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        />
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------

function Eyebrow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

function GalleryDepthImage({
  src,
  alt,
  className = "",
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <DepthCard className={className}>
      <div className="relative size-full overflow-hidden rounded-3xl border border-border/70">
        <img
          src={src}
          alt={alt}
          className="size-full object-cover transition-transform duration-500 group-hover/depth:scale-105"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/depth:opacity-100"
        />
      </div>
    </DepthCard>
  )
}

// ---------------------------------------------------------------------------
// Hito de trayectoria — tarjeta 3D sobre línea central, alternando de lado
// ---------------------------------------------------------------------------

function MilestoneCard({ milestone, index }: { milestone: LegadoMilestone; index: number }) {
  const reversed = index % 2 === 1

  const card = (
    <DepthCard className="flex-1" intensity={6}>
      <div
        className={`flex flex-row items-center gap-4 rounded-3xl border border-border/70 bg-card/50 p-4 backdrop-blur sm:gap-6 sm:p-5 ${
          reversed ? "md:flex-row-reverse" : ""
        }`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {milestone.image ? (
          <div
            className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border sm:h-32 sm:w-32"
            style={{ transform: "translateZ(28px)" }}
          >
            <img src={milestone.image} alt={milestone.title} className="size-full object-cover" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 via-card to-background text-primary/60 sm:h-32 sm:w-32"
            style={{ transform: "translateZ(28px)" }}
          >
            <Music2 className="size-8" />
          </div>
        )}
        <div className={`min-w-0 flex-1 ${reversed ? "md:text-right" : ""}`} style={{ transform: "translateZ(16px)" }}>
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
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{milestone.description}</p>
        </div>
      </div>
    </DepthCard>
  )

  const spacer = <div className="hidden md:block md:flex-1" aria-hidden="true" />

  return (
    <div className="relative flex md:items-center md:gap-10">
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-[0_0_12px_var(--primary)] md:block"
      />
      {reversed ? spacer : card}
      {reversed ? card : spacer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal — Bento Grid
// ---------------------------------------------------------------------------

export function LegadoBlock({ data }: { data: LegadoData }) {
  const isEmpty =
    !data.headline && !data.bio && data.timeline.length === 0 && data.gallery.length === 0

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        Todavía no hay información de trayectoria.
      </div>
    )
  }

  const [heroImage, secondImage, ...mosaicImages] = data.gallery
  const hasTags = data.genres.length > 0 || data.influences.length > 0

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      {/* ── Bento principal ── */}
      <div className="grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 md:grid-cols-12 md:[grid-auto-flow:dense]">
        {/* Manifiesto / headline */}
        {data.headline ? (
          <Reveal className={heroImage ? "md:col-span-7" : "md:col-span-12"}>
            <DepthCard className="h-full">
              <div
                className="gradient-border relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-card/50 p-6 backdrop-blur sm:p-10"
                style={{ transformStyle: "preserve-3d" }}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/15 blur-[80px]"
                />
                <Eyebrow icon={Sparkles}>Trayectoria</Eyebrow>
                <div style={{ transform: "translateZ(30px)" }}>
                  <Quote className="mt-6 size-8 text-primary/40 sm:size-10" />
                  <p className="mt-2 text-balance font-display text-2xl font-bold leading-tight text-foreground sm:text-4xl">
                    {data.headline}
                  </p>
                </div>
                <div aria-hidden="true" className="mt-6 h-px w-1/3 bg-gradient-to-r from-primary/60 to-transparent" />
              </div>
            </DepthCard>
          </Reveal>
        ) : null}

        {/* Foto principal de la galería */}
        {heroImage ? (
          <Reveal delay={0.08} className={`min-h-64 ${data.headline ? "md:col-span-5" : "md:col-span-7"}`}>
            <GalleryDepthImage src={heroImage} alt="Foto principal" className="h-full min-h-64" />
          </Reveal>
        ) : null}

        {/* Biografía */}
        {data.bio ? (
          <Reveal delay={0.12} className={hasTags || secondImage ? "md:col-span-6" : "md:col-span-12"}>
            <DepthCard className="h-full" intensity={5}>
              <div className="flex h-full flex-col rounded-3xl border border-border/70 bg-card/40 p-6 backdrop-blur sm:p-8">
                <Eyebrow icon={Disc3}>Biografía</Eyebrow>
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90 sm:text-base">
                  {data.bio}
                </p>
              </div>
            </DepthCard>
          </Reveal>
        ) : null}

        {/* Géneros + influencias */}
        {hasTags ? (
          <Reveal delay={0.16} className={secondImage ? "md:col-span-3" : "md:col-span-6"}>
            <DepthCard className="h-full" intensity={7}>
              <div className="flex h-full flex-col gap-5 rounded-3xl border border-border/70 bg-card/40 p-6 backdrop-blur">
                {data.genres.length > 0 ? (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Music2 className="size-3.5 text-primary" /> Géneros
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
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Heart className="size-3.5 text-primary" /> Influencias
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
              </div>
            </DepthCard>
          </Reveal>
        ) : null}

        {/* Segunda foto */}
        {secondImage ? (
          <Reveal delay={0.2} className="min-h-56 md:col-span-3">
            <GalleryDepthImage src={secondImage} alt="Foto de galería" className="h-full min-h-56" />
          </Reveal>
        ) : null}
      </div>

      {/* ── Línea de tiempo ── */}
      {data.timeline.length > 0 ? (
        <div>
          <Reveal>
            <Eyebrow icon={Calendar}>Hitos</Eyebrow>
          </Reveal>
          <div className="relative mt-6">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-primary/50 via-border to-transparent md:block"
            />
            <div className="flex flex-col gap-8 md:gap-12">
              {data.timeline.map((milestone, i) => (
                <Reveal key={milestone.id} delay={Math.min(i * 0.08, 0.4)}>
                  <MilestoneCard milestone={milestone} index={i} />
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Mosaico con el resto de la galería ── */}
      {mosaicImages.length > 0 ? (
        <div>
          <Reveal>
            <Eyebrow icon={MapPin}>Galería</Eyebrow>
          </Reveal>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-12">
            {mosaicImages.map((url, i) => {
              // Patrón de bento que se repite cada 4 fotos: ancha, cuadrada,
              // cuadrada, ancha — mantiene el ritmo asimétrico sin huecos.
              const pattern = ["md:col-span-5", "md:col-span-3", "md:col-span-4", "md:col-span-4"]
              const span = pattern[i % pattern.length]
              return (
                <Reveal key={`${url}-${i}`} delay={Math.min(i * 0.05, 0.4)} className={`${span} min-h-48`}>
                  <GalleryDepthImage src={url} alt={`Foto de galería ${i + 3}`} className="h-full min-h-48" />
                </Reveal>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

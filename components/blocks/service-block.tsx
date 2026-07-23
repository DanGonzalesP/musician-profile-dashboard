"use client"

// Servicios públicos del artista — tarjetas completas con categoría,
// modalidad, duración, qué incluye y botón de reserva. Los servicios vienen
// de la tabla `services` (gestión en /perfil/admin-servicios o el editor).

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowUpRight,
  CalendarCheck,
  Check,
  Clock,
  Globe,
  MapPin,
  Sparkles,
  Timer,
} from "lucide-react"
import type { ServiceData } from "@/lib/blocks"
import { priceUnitLabel, serviceCategoryLabel, serviceDurationLabel, formatMoney, type CatalogService } from "@/lib/catalog"
import { useLocale } from "@/components/locale-provider"

function modalityLabel(m: CatalogService["modality"]): string {
  if (m === "presencial") return "Presencial"
  if (m === "online") return "Online"
  return "Presencial u online"
}

function ServicePrice({ service }: { service: CatalogService }) {
  const value = Number(service.price)
  const hasPrice = service.price !== "" && !Number.isNaN(value) && value > 0
  return (
    <p className="text-xl font-bold tabular-nums text-primary">
      {hasPrice ? formatMoney(value, service.currency) : "A convenir"}
      {hasPrice && (
        <span className="ml-1 text-xs font-medium text-muted-foreground">{priceUnitLabel(service.priceUnit)}</span>
      )}
    </p>
  )
}

function BookButton({ service }: { service: CatalogService }) {
  if (!service.bookingUrl) return null
  return (
    <a
      href={service.bookingUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-[0_0_24px_-8px_var(--primary)] transition-all hover:opacity-90 hover:shadow-[0_0_32px_-6px_var(--primary)]"
    >
      <CalendarCheck className="size-3.5" />
      Reservar / Cotizar
      <ArrowUpRight className="size-3.5" />
    </a>
  )
}

export function ServiceBlock({ data, services }: { data: ServiceData; services: CatalogService[] }) {
  const { t } = useLocale()
  const [category, setCategory] = useState<string>("todo")

  const activos = useMemo(() => (services || []).filter((s) => s.isActive !== false), [services])

  const categories = useMemo(() => {
    const ids = [...new Set(activos.map((s) => s.category || "otro"))]
    return ids.length > 1 ? ids : []
  }, [activos])

  const filtered = category === "todo" ? activos : activos.filter((s) => (s.category || "otro") === category)

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <Sparkles className="size-5 text-primary" />
          {data.title || t("service_title")}
        </h3>
        {activos.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {activos.length} {activos.length === 1 ? "servicio" : "servicios"}
          </span>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCategory("todo")}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              category === "todo"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            Todo
          </button>
          {categories.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                category === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {serviceCategoryLabel(id)}
            </button>
          ))}
        </div>
      )}

      <motion.div
        className="grid gap-4 sm:grid-cols-2"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {filtered.map((service) => (
          <motion.div
            key={service.id}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } } }}
            className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-background/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_var(--primary)] ${
              service.isFeatured ? "gradient-border border-transparent" : "border-border hover:border-primary/50"
            }`}
          >
            {service.imageUrl && (
              <div className="pointer-events-none absolute inset-0 opacity-[0.08] transition-opacity duration-300 group-hover:opacity-[0.14]">
                <img src={service.imageUrl} alt="" className="size-full object-cover" />
              </div>
            )}

            <div className="relative flex items-start justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                {serviceCategoryLabel(service.category)}
              </span>
              {service.isFeatured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  <Sparkles className="size-2.5" /> Top
                </span>
              )}
            </div>

            <p className="relative text-base font-semibold text-foreground">{service.title || t("service_new")}</p>

            {service.description && (
              <p className="relative line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {service.description}
              </p>
            )}

            {(service.features?.length ?? 0) > 0 && (
              <ul className="relative space-y-1">
                {service.features.slice(0, 4).map((f, i) => (
                  <li key={`${f}-${i}`} className="flex items-start gap-1.5 text-xs text-foreground/85">
                    <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
                {service.features.length > 4 && (
                  <li className="text-[11px] text-muted-foreground">y {service.features.length - 4} más...</li>
                )}
              </ul>
            )}

            <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {service.modality === "online" ? <Globe className="size-3" /> : <MapPin className="size-3" />}
                {modalityLabel(service.modality)}
              </span>
              {serviceDurationLabel(service) && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> {serviceDurationLabel(service)}
                </span>
              )}
              {service.deliveryTime && (
                <span className="inline-flex items-center gap-1">
                  <Timer className="size-3" /> Entrega: {service.deliveryTime}
                </span>
              )}
            </div>

            <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
              <ServicePrice service={service} />
              <BookButton service={service} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {activos.length === 0 && (
        <p className="py-2 text-center text-xs italic text-muted-foreground">{t("service_empty")}</p>
      )}
    </div>
  )
}

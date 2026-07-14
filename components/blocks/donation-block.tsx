"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import type { DonationData } from "@/lib/blocks"
import { SupportModal } from "./support-modal"

function daysRemaining(deadline: string): number | null {
  if (!deadline) return null
  const end = new Date(`${deadline}T23:59:59`)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function DonationBlock({ data }: { data: DonationData }) {
  const goal = Number(data.goalAmount) || 0
  const hasGoal = goal > 0
  const currency = data.currency || "USD"

  // Estado local, solo para poder probar visualmente el flujo de apoyo: se
  // inicializa con lo guardado, pero los pagos simulados no se persisten —
  // la pasarela real todavía no existe.
  const [raised, setRaised] = useState(() => Number(data.currentAmount) || 0)
  const [modalOpen, setModalOpen] = useState(false)

  const percent = hasGoal ? Math.min(100, Math.round((raised / goal) * 100)) : 0
  const remaining = daysRemaining(data.deadline)

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card/60 to-card/40 p-6 sm:p-8">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Heart className="size-5" />
        </span>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">
            {data.title || "Apoya Mi Música"}
          </h3>
          {hasGoal && (
            <p className="text-xs text-muted-foreground">
              Meta: {currency} {goal.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{data.description}</p>
      )}

      {/* Barra de progreso — calculada en vivo a partir de meta y monto recaudado */}
      {hasGoal && (
        <div className="mb-5">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-primary">{percent}% completado</span>
              {" — "}
              {currency} {raised.toLocaleString()} de {currency} {goal.toLocaleString()} requeridos
            </span>
            {remaining !== null && (
              <span className="font-medium">
                {remaining > 0
                  ? `Quedan ${remaining} ${remaining === 1 ? "día" : "días"}`
                  : remaining === 0
                    ? "¡Último día!"
                    : "Campaña finalizada"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* CTA — abre el modal de pago simulado, sin pasarela real todavía */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-95"
      >
        <Heart className="size-4" />
        {data.buttonText || "Apoyar"}
      </button>

      {modalOpen && (
        <SupportModal
          currency={currency}
          onClose={() => setModalOpen(false)}
          onConfirm={(amount) => setRaised((prev) => prev + amount)}
        />
      )}
    </div>
  )
}

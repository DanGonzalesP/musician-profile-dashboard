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
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Heart className="size-3.5 text-primary" />
        Campaña de Recaudación
      </div>

      <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
        {data.title || "Apoya Mi Música"}
      </h3>

      {data.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{data.description}</p>
      )}

      {/* Barra de progreso — calculada en vivo a partir de meta y monto recaudado */}
      {hasGoal && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{percent}%</span> completado — {currency}{" "}
              {raised.toLocaleString()} de {currency} {goal.toLocaleString()}
            </span>
            {remaining !== null && (
              <span>
                {remaining > 0
                  ? `Quedan ${remaining} ${remaining === 1 ? "día" : "días"}`
                  : remaining === 0
                    ? "Último día"
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
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary"
      >
        <Heart className="size-3.5" />
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

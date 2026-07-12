"use client"

import { Heart, ExternalLink } from "lucide-react"
import type { DonationData } from "@/lib/blocks"

export function DonationBlock({ data }: { data: DonationData }) {
  const hasGoal = data.goalAmount && data.goalAmount.trim() !== ""
  const currency = data.currency || "USD"

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card/60 to-card/40 p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Heart className="size-5" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {data.title || "Support My Music"}
          </h3>
          {hasGoal && (
            <p className="text-xs text-muted-foreground">
              Goal: {currency} {data.goalAmount}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          {data.description}
        </p>
      )}

      {/* Progress bar — decorative, shown when goal is set */}
      {hasGoal && (
        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>Progress</span>
            <span className="font-semibold text-primary">42%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
              style={{ width: "42%" }}
            />
          </div>
        </div>
      )}

      {/* CTA Button */}
      {data.buttonUrl ? (
        <a
          href={data.buttonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-95"
        >
          <Heart className="size-4" />
          {data.buttonText || "Support Now"}
          <ExternalLink className="size-3.5 opacity-70" />
        </a>
      ) : (
        <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/70 px-4 py-2.5 text-sm font-semibold text-primary-foreground opacity-60 cursor-not-allowed">
          <Heart className="size-4" />
          {data.buttonText || "Support Now"}
        </div>
      )}

      {/* Helper note when no URL */}
      {!data.buttonUrl && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground italic">
          Añade una URL en el editor para activar el botón
        </p>
      )}
    </div>
  )
}

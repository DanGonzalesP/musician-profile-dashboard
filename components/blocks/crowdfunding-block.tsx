"use client";

import { useState } from "react";
import { Building2, Flame, Heart, Rocket } from "lucide-react";
import type { CrowdfundingData } from "@/lib/blocks";
import { useLocale } from "@/components/locale-provider";
import { SupportModal } from "./support-modal";

function daysRemainingLabel(
  count: number,
  t: (key: string, params?: Record<string, string>) => string
) {
  // Solo se llama cuando count > 0 (ver el guard "daysLeft > 0 &&" en el
  // punto de uso) — daysLeft es un número estático que pone el artista, no
  // una fecha límite, así que aquí no existe el caso "0 días = último día"
  // ni "negativo = campaña finalizada" que sí tiene donation-block.tsx.
  if (count === 1) return t("donation_day_one", { count: String(count) });
  return t("donation_day_other", { count: String(count) });
}

export function CrowdfundingBlock({ data }: { data: CrowdfundingData }) {
  const { t } = useLocale();

  const [raised, setRaised] = useState(() => Number(data.currentAmount) || 0);
  const [backers, setBackers] = useState(() => Number(data.backerCount) || 0);
  const [hypeCount, setHypeCount] = useState(() => Number(data.hypeCount) || 0);
  const [hyped, setHyped] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const targetAmount = Number(data.targetAmount) || 0;
  const showProgress = targetAmount > 0;
  const percent = showProgress ? Math.min(100, Math.round((raised / targetAmount) * 100)) : 0;
  const daysLeft = Number(data.daysLeft) || 0;

  const handleHype = () => {
    if (hyped) return;
    setHypeCount((h) => h + 1);
    setHyped(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Rocket className="size-3.5" />
        {t("crowdfunding_eyebrow")}
      </span>

      <h3 className="mt-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
        {data.title || t("crowdfunding_title_fallback")}
      </h3>

      {data.description && (
        <p className="mt-1.5 text-sm text-muted-foreground">{data.description}</p>
      )}

      {data.chosenStudio && (
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Building2 className="size-3.5" />
          {t("crowdfunding_studio_label")}: {data.chosenStudio}
        </span>
      )}

      {showProgress && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted sm:h-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{
                width: `${percent}%`,
                boxShadow: "0 0 10px color-mix(in oklch, var(--primary) 55%, transparent)",
              }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {percent}% —{" "}
              {t("crowdfunding_amounts", {
                raised: raised.toLocaleString("en-US"),
                goal: targetAmount.toLocaleString("en-US"),
              })}
            </span>
            {daysLeft > 0 && <span>{daysRemainingLabel(daysLeft, t)}</span>}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label={t("crowdfunding_support_aria")}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Heart className="size-4" />
          {t("crowdfunding_support_button")}
        </button>

        <button
          type="button"
          onClick={handleHype}
          disabled={hyped}
          aria-label={hyped ? t("crowdfunding_hyped_aria") : t("crowdfunding_hype_aria")}
          className={`inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-opacity ${
            hyped ? "cursor-not-allowed opacity-60" : "hover:opacity-90"
          }`}
        >
          <Flame className="size-4" fill={hyped ? "currentColor" : "none"} />
          {hyped ? t("crowdfunding_hyped_button") : t("crowdfunding_hype_button")}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {t("crowdfunding_waiting_and_backers", {
          hype: String(hypeCount),
          backers: String(backers),
        })}
      </p>

      {modalOpen && (
        <SupportModal
          currency="USD"
          onClose={() => setModalOpen(false)}
          onConfirm={(amount) => {
            setRaised((r) => r + amount);
            setBackers((b) => b + 1);
          }}
        />
      )}
    </div>
  );
}
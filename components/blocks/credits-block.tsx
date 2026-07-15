"use client";

import { useState } from "react";
import { Users, PlayCircle, ChevronDown } from "lucide-react";
import type { CreditItem, CreditsData } from "@/lib/blocks";
import { useLocale } from "@/components/locale-provider";
import { getYoutubeEmbedUrl } from "@/lib/youtube";

export function CreditsBlock({ data }: { data: CreditsData }) {
  const { t } = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Un crédito "interno" (colaboración con otro artista de la plataforma)
  // solo se publica una vez que su dueño lo aceptó desde su panel de
  // notificaciones — mientras esté "pending" o quede "rejected" no aparece
  // acá. Los créditos "externos" (YouTube) siempre se muestran de inmediato.
  const visibleCredits = data.credits.filter(
    (credit) => credit.sourceType === "external" || credit.status === "accepted"
  );

  if (visibleCredits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {t("credits_empty")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Users className="size-3.5" />
        {t("credits_eyebrow")}
      </span>

      <div className="mt-4 flex flex-col divide-y divide-border">
        {visibleCredits.map((credit) => (
          <CreditRow
            key={credit.id}
            credit={credit}
            t={t}
            expanded={expandedId === credit.id}
            onToggle={() => setExpandedId((current) => (current === credit.id ? null : credit.id))}
          />
        ))}
      </div>
    </div>
  );
}

function CreditRow({
  credit,
  t,
  expanded,
  onToggle,
}: {
  credit: CreditItem;
  t: (key: string, vars?: Record<string, string>) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const roleLabel = t(`credit_role_${credit.role.toLowerCase()}`);
  const embedUrl = credit.sourceType === "external" && credit.externalUrl ? getYoutubeEmbedUrl(credit.externalUrl) : null;

  const content = (
    <div className="flex items-center gap-3 py-3">
      <span
        title={roleLabel}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-xs font-bold text-primary"
      >
        {credit.role}
        <span className="sr-only">{roleLabel}</span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {credit.title || t("credits_untitled")}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {credit.mainArtist || t("credits_artist_fallback")}
        </p>
        {embedUrl && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <PlayCircle className="size-3" />
            {t("credits_external_badge")}
          </span>
        )}
      </div>

      {embedUrl && (
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      )}
    </div>
  );

  if (embedUrl) {
    return (
      <div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={t("credits_open_aria")}
          aria-expanded={expanded}
          className="w-full cursor-pointer text-left transition-colors hover:bg-accent/40"
        >
          {content}
        </button>
        {expanded && (
          <div className="aspect-video w-full overflow-hidden rounded-lg pb-3">
            <iframe
              src={embedUrl}
              title={credit.title || t("credits_untitled")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="size-full"
            />
          </div>
        )}
      </div>
    );
  }

  return <div>{content}</div>;
}

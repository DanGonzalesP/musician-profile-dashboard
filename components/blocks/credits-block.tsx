
"use client";

import { Users, ExternalLink } from "lucide-react";
import type { CreditItem, CreditsData } from "@/lib/blocks";
import { useLocale } from "@/components/locale-provider";

export function CreditsBlock({ data }: { data: CreditsData }) {
  const { t } = useLocale();

  if (data.credits.length === 0) {
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
        {data.credits.map((credit) => (
          <CreditRow key={credit.id} credit={credit} t={t} />
        ))}
      </div>
    </div>
  );
}

function CreditRow({
  credit,
  t,
}: {
  credit: CreditItem;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const roleLabel = t(`credit_role_${credit.role.toLowerCase()}`);

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
      </div>

      {credit.externalUrl && (
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  if (credit.externalUrl) {
    return (
      <a
        href={credit.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("credits_open_aria")}
        className="cursor-pointer transition-colors hover:bg-accent/40"
      >
        {content}
      </a>
    );
  }

  return <div>{content}</div>;
}
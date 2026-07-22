"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Music, Users } from "lucide-react";
import type { CreditItem, CreditsData } from "@/lib/blocks";
import { useLocale } from "@/components/locale-provider";
import { detectOembedProvider, getExternalEmbedUrl } from "@/lib/oembed";
import { AutoScrollCarousel } from "./auto-scroll-carousel";

type Translate = (key: string, vars?: Record<string, string>) => string;

export function CreditsBlock({ data }: { data: CreditsData }) {
  const { t } = useLocale();

  // Un crédito "interno" (colaboración con otro artista de la plataforma)
  // solo se publica una vez que su dueño lo aceptó desde su panel de
  // notificaciones — mientras esté "pending" o quede "rejected" no aparece
  // acá. Los créditos "externos" siempre se muestran de inmediato.
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
      <span className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Users className="size-3.5" />
        {t("credits_eyebrow")}
      </span>

      <VerticalCreditsCarousel credits={visibleCredits} t={t} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carrusel vertical con auto-scroll infinito (AutoScrollCarousel, eje "y"):
// las tarjetas se desplazan solas hacia arriba en loop sin fin y el usuario
// puede además deslizar a mano. Se pausa al pasar el mouse, al interactuar, o
// cuando hay una tarjeta expandida reproduciendo un embed.
// ---------------------------------------------------------------------------

function VerticalCreditsCarousel({ credits, t }: { credits: CreditItem[]; t: Translate }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AutoScrollCarousel
      axis="y"
      paused={expandedId !== null}
      ariaLabel={t("credits_eyebrow")}
      className="max-h-[420px] sm:max-h-[480px]"
      innerClassName="flex flex-col gap-3 pb-3"
    >
      {credits.map((credit) => (
        <div key={credit.id} className="shrink-0">
          <CreditCard
            credit={credit}
            t={t}
            expanded={expandedId === credit.id}
            onToggle={() => setExpandedId((current) => (current === credit.id ? null : credit.id))}
          />
        </div>
      ))}
    </AutoScrollCarousel>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de crédito — la imagen es ahora el elemento visual principal (antes
// era el círculo con la letra del rol); el rol se muestra como una insignia
// pequeña superpuesta en la esquina de la imagen. Soporta reproducción
// multi-plataforma (YouTube/Spotify/SoundCloud/Facebook/Instagram vía
// iframe, TikTok vía botón "Ver en TikTok" — sin iframe de terceros).
// ---------------------------------------------------------------------------

function CreditCard({
  credit,
  t,
  expanded,
  onToggle,
}: {
  credit: CreditItem;
  t: Translate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const roleLabel = t(`credit_role_${credit.role.toLowerCase()}`);
  const title = credit.title || t("credits_untitled");
  const artist = credit.mainArtist || t("credits_artist_fallback");

  const isExternal = credit.sourceType === "external" && !!credit.externalUrl;
  const embedUrl = isExternal ? getExternalEmbedUrl(credit.externalUrl!) : null;
  const isTiktok = isExternal && detectOembedProvider(credit.externalUrl!) === "tiktok";

  const media = (
    <div className="relative h-full w-28 shrink-0 overflow-hidden sm:w-36">
      {credit.image ? (
        <img src={credit.image} alt={title} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted">
          <Music className="size-7 text-muted-foreground/60" />
        </div>
      )}
      <span
        title={roleLabel}
        className="absolute bottom-1.5 left-1.5 rounded-full border border-primary/30 bg-background/80 px-2 py-0.5 text-[10px] font-bold text-primary backdrop-blur"
      >
        {credit.role}
        <span className="sr-only">{roleLabel}</span>
      </span>
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3.5 py-2.5">
      <p className="truncate text-sm font-semibold text-foreground">{title}</p>
      <p className="truncate text-xs text-muted-foreground">{artist}</p>
      {isTiktok && (
        <a
          href={credit.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
        >
          <ExternalLink className="size-3.5" />
          {t("credits_view_tiktok")}
        </a>
      )}
    </div>
  );

  const cardShell = (
    <div className="flex h-40 w-full overflow-hidden rounded-xl border border-border bg-card/60 sm:h-44">
      {media}
      {body}
      {embedUrl && (
        <div className="flex shrink-0 items-center pr-3">
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
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
          className="block w-full cursor-pointer text-left transition-opacity hover:opacity-90"
        >
          {cardShell}
        </button>
        {expanded && (
          <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg">
            <iframe
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="size-full"
            />
          </div>
        )}
      </div>
    );
  }

  return <div>{cardShell}</div>;
}

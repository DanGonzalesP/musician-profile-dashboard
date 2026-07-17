"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, LayoutDashboard, Loader2, LogOut, Sparkles, Users } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { supabase } from "@/lib/supabase";
import { setActiveBandId, type MyProfileOption } from "@/lib/bands";

interface ProfileMenuProps {
  userId: string;
  personalDisplayName: string;
  personalSlug: string;
  bands: MyProfileOption[];
}

export default function ProfileMenu({ userId, personalDisplayName, personalSlug, bands }: ProfileMenuProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switchingBandId, setSwitchingBandId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const name = personalDisplayName || t("feed_menu_my_profile_fallback");
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleSwitchToBand = (bandId: string) => {
    setSwitchingBandId(bandId);
    setActiveBandId(userId, bandId);
    if (window.location.pathname === "/dashboard") {
      window.location.reload();
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1 pr-3 backdrop-blur transition-colors hover:bg-accent/40"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {initial}
        </span>
        <span className="max-w-32 truncate text-sm font-medium text-foreground">{name}</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] w-72 origin-top-right rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl backdrop-blur"
        >
          <div className="flex items-center gap-3 px-1 pb-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
              {initial}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          </div>

          <div className="flex flex-col gap-1">
            <Link
              href={`/${personalSlug}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent/40"
            >
              <ExternalLink className="size-4 text-muted-foreground" />
              {t("feed_menu_public_profile")}
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent/40"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              {t("feed_menu_artist_panel")}
            </Link>
          </div>

          <div className="my-3 border-t border-border" />

          {bands.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("feed_menu_bands_title")}
              </p>
              {bands.map((band) => {
                const isSwitching = switchingBandId === band.id;
                return (
                  <button
                    key={band.id}
                    type="button"
                    disabled={switchingBandId !== null}
                    onClick={() => handleSwitchToBand(band.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/40 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSwitching ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <Users className="size-4 text-muted-foreground" />
                    )}
                    <span className="truncate">
                      {isSwitching ? t("feed_menu_switching") : t("feed_menu_switch_to", { name: band.displayName })}
                    </span>
                  </button>
                );
              })}
              <Link
                href="/perfil/banda"
                onClick={() => setOpen(false)}
                className="px-2.5 pt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("feed_menu_manage_bands")}
              </Link>
            </div>
          ) : (
            <Link
              href="/perfil/banda"
              onClick={() => setOpen(false)}
              className="flex flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary/10 p-3 transition-colors hover:bg-primary/15"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Sparkles className="size-4" />
                {t("feed_menu_create_band_title")}
              </span>
              <span className="text-xs text-muted-foreground">{t("feed_menu_create_band_subtitle")}</span>
              <span className="mt-1 text-xs font-medium text-primary">{t("feed_menu_create_band_cta")}</span>
            </Link>
          )}

          <div className="my-3 border-t border-border" />

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            {t("feed_menu_logout")}
          </button>
        </div>
      )}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { Logo } from "@/components/logo";
import ProfileMenu from "./ProfileMenu";
import { supabase } from "@/lib/supabase";
import { fetchMyProfiles, type MyProfileOption } from "@/lib/bands";

export default function FeedHeader() {
  const { t } = useLocale();
  const [checkingSession, setCheckingSession] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [personalDisplayName, setPersonalDisplayName] = useState("");
  const [bands, setBands] = useState<MyProfileOption[]>([]);

  useEffect(() => {
    let active = true;

    const loadProfiles = async (id: string) => {
      const profiles = await fetchMyProfiles(id);
      if (!active) return;
      const personal = profiles.find((p) => !p.isBand);
      setPersonalDisplayName(personal?.displayName ?? "");
      setBands(profiles.filter((p) => p.isBand));
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      setUserId(user?.id ?? null);
      if (user) loadProfiles(user.id);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      if (user) {
        loadProfiles(user.id);
      } else {
        setPersonalDisplayName("");
        setBands([]);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const personalSlug = personalDisplayName.trim().toLowerCase().replace(/\s+/g, "-");

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-linear-to-b from-background/90 to-transparent px-6 py-4">
      <div className="pointer-events-auto">
        <Logo />
      </div>

      {/* El selector de idioma ahora vive en Configuración, junto al tema. */}
      <div className="pointer-events-auto flex items-center gap-3">
        {!checkingSession &&
          (userId ? (
            <ProfileMenu
              userId={userId}
              personalDisplayName={personalDisplayName}
              personalSlug={personalSlug}
              bands={bands}
            />
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("feed_header_login")}
              </Link>
              <Link
                href="/login?modo=registro"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("feed_header_register")}
              </Link>
            </>
          ))}
      </div>
    </header>
  );
}
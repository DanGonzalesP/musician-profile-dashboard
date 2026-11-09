"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { Logo } from "@/components/logo";
import ProfileMenu from "./ProfileMenu";
import { supabase } from "@/lib/supabase";
import { fetchMyProfiles, type MyProfileOption } from "@/lib/bands";
import { useNotificationCount } from "@/lib/use-notification-count";

export default function FeedHeader() {
  const { t } = useLocale();
  const [checkingSession, setCheckingSession] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [personalDisplayName, setPersonalDisplayName] = useState("");
  // Username REAL del perfil personal (identidad pública, lo que va en la URL).
  // No se deriva del nombre: el username lleva un sufijo aleatorio.
  const [personalUsername, setPersonalUsername] = useState("");
  const [bands, setBands] = useState<MyProfileOption[]>([]);
  const { count: unreadCount, loading: countLoading } = useNotificationCount();
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;

    const clearProfileData = () => {
      setPersonalDisplayName("");
      setPersonalUsername("");
      setBands([]);
      setProfilesLoaded(false);
      setLoadError(false);
    };

    const loadProfiles = async (id: string, request: number) => {
      try {
        const profiles = await fetchMyProfiles(id);
        if (!active || request !== requestId.current) return;
        const personal = profiles.find((p) => !p.isBand);
        setPersonalDisplayName(personal?.displayName ?? "");
        setPersonalUsername(personal?.username ?? "");
        setBands(profiles.filter((p) => p.isBand));
        setProfilesLoaded(true);

      } catch {
        if (!active || request !== requestId.current) return;
        clearProfileData();
        setLoadError(true);
      }
    };

    const loadSession = async () => {
      const request = ++requestId.current;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!active || authEventSeen || request !== requestId.current) return;
        const user = data.user;
        setUserId(user?.id ?? null);
        if (user) await loadProfiles(user.id, request);
        else setLoadError(false);
        setCheckingSession(false);
      } catch {
        if (!active || authEventSeen || request !== requestId.current) return;
        setUserId(null);
        setLoadError(true);
        setCheckingSession(false);
      }
    };

    void loadSession();

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const result = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        authEventSeen = true;
        const request = ++requestId.current;
        const user = session?.user ?? null;
        setUserId(user?.id ?? null);
        clearProfileData();
        setCheckingSession(false);
        if (user) void loadProfiles(user.id, request);
      });
      subscription = result.data.subscription;
    } catch {
      // Igual que un fallo de la lectura inicial: se informa desde la cola de
      // microtareas, fuera del cuerpo síncrono del efecto.
      queueMicrotask(() => {
        if (!active) return;
        setLoadError(true);
        setCheckingSession(false);
      });
    }

    return () => {
      active = false;
      requestId.current += 1;
      subscription?.unsubscribe();
    };
  }, [retryKey]);

  const personalSlug = personalUsername;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-linear-to-b from-background/90 to-transparent px-6 py-4">
      <div className="pointer-events-auto">
        <Logo />
      </div>

      {/* El selector de idioma ahora vive en Configuración, junto al tema. */}
      <div className="pointer-events-auto flex items-center gap-3">
        {loadError && !checkingSession && (
          <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
            <span>No se pudieron cargar tus perfiles.</span>
            <button type="button" onClick={() => { setCheckingSession(true); setLoadError(false); setRetryKey((key) => key + 1); }} className="underline underline-offset-2">
              Reintentar
            </button>
          </div>
        )}
        {!checkingSession &&
          (userId ? (
            <>
              <Link
                href="/perfil/notificaciones"
                aria-label={`${t("feed_notifications_aria")}: ${unreadCount === null ? t(countLoading ? "feed_notifications_loading" : "feed_notifications_unknown") : `${unreadCount} ${t("feed_notifications_pending")}`}`}
                title={unreadCount === null ? t(countLoading ? "feed_notifications_loading" : "feed_notifications_unknown") : t("feed_notifications_aria")}
                className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card/70 text-foreground backdrop-blur transition-colors hover:bg-accent/40"
              >
                <Bell className="size-4" />
                {(unreadCount === null || unreadCount > 0) && (
                  <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount ?? (countLoading ? "…" : "?")}
                  </span>
                )}
              </Link>
              <ProfileMenu
                key={userId}
                userId={userId}
                personalDisplayName={personalDisplayName}
                personalSlug={personalSlug}
                bands={bands}
                profilesLoaded={profilesLoaded}
              />
            </>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Briefcase,
  Globe,
  LogOut,
  Menu,
  Package,
  Palette,
  Scale,
  Settings,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotificationCount } from "@/lib/use-notification-count";
import { Logo } from "@/components/logo";
import { hasPlatformPermission } from "@/lib/admin";

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [publicSlug, setPublicSlug] = useState("");
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [profileFailed, setProfileFailed] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const [canOperate, setCanOperate] = useState(false);
  // "Grupos Musicales" solo se muestra si el artista ya creó más de un
  // grupo — con uno solo (el caso normal) el link sobra en el panel.
  const [ownedBandCount, setOwnedBandCount] = useState(0);
  // Total de notificaciones sin resolver — solicitudes de crédito pendientes
  // + preguntas de visitantes sin leer — para el badge del link de abajo.
  const { count: unreadCount, failed: countFailed, loading: countLoading } = useNotificationCount();

  useEffect(() => {
    let active = true;
    let generation = 0;
    let previousUserId: string | null | undefined;
    async function cargarPerfil() {
      const current = ++generation;
      setPublicSlug(""); setOwnedBandCount(0); setProfileFailed(false); setCanOperate(false);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active || current !== generation) return;
        if (error) throw error;
        if (!user) return;
        const [profile, bands, moderation, maintenance] = await Promise.all([
          supabase.from("profiles").select("id, username").eq("user_id", user.id).eq("profile_type", "artist").maybeSingle(),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id).eq("profile_type", "band"),
          hasPlatformPermission(supabase, "moderation"),
          hasPlatformPermission(supabase, "maintenance"),
        ]);
        if (!active || current !== generation) return;
        setCanOperate(moderation || maintenance);
        if (profile.error || bands.error) throw new Error("profile");
        setPublicSlug(profile.data?.username ?? "");
        setOwnedBandCount(bands.count ?? 0);
      } catch {
        if (active && current === generation) setProfileFailed(true);
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (id === previousUserId) return;
      previousUserId = id;
      generation += 1;
      setPublicSlug(""); setOwnedBandCount(0); setProfileFailed(false); setMobileNavigation(false); setCanOperate(false);
      void Promise.resolve().then(() => { if (active) void cargarPerfil(); });
    });
    void cargarPerfil();
    return () => { active = false; generation += 1; subscription.unsubscribe(); };
  }, [profileRevision]);

  const enlaces: { name: string; href: string; icon: LucideIcon; badge?: number }[] = [
    { name: "Editor de Página", href: "/dashboard", icon: Palette },
    ...(publicSlug ? [{ name: "Ver Portal Público", href: `/${encodeURIComponent(publicSlug)}`, icon: Globe }] : []),
    { name: "Métricas / Dashboard", href: "/perfil/dashboard", icon: BarChart3 },
    ...(ownedBandCount > 1 ? [{ name: "Grupos Musicales", href: "/perfil/banda", icon: Users }] : []),
    { name: "Notificaciones", href: "/perfil/notificaciones", icon: Bell, badge: unreadCount ?? undefined },
    { name: "Decisiones y revisiones", href: "/perfil/moderacion", icon: Scale },
    { name: "Ventas y pedidos", href: "/perfil/pedidos", icon: Package },
    { name: "Gestionar Merch", href: "/perfil/admin-merch", icon: Shirt },
    { name: "Gestionar Servicios", href: "/perfil/admin-servicios", icon: Briefcase },
    { name: "Herramientas Legales", href: "/perfil/legal", icon: Scale },
    { name: "Configurar Perfil", href: "/perfil/config", icon: Settings },
    ...(canOperate ? [{ name: "Administración de Vibe", href: "/admin", icon: Settings }] : []),
  ];

  const cerrarSesion = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSessionError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setSessionError("No pudimos cerrar la sesión. Inténtalo de nuevo."); return; }
      router.replace("/login");
    } catch {
      setSessionError("No pudimos cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.");
    } finally { setSigningOut(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <a href="#panel-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3">Ir al contenido</a>
      <aside className="glass-panel w-full shrink-0 border-b border-sidebar-border p-4 md:p-6 flex flex-col justify-between md:w-64 md:border-b-0 md:border-r">
        <div className="space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver al Editor de Página
          </Link>
          <div className="space-y-3">
            <Logo showWordmark={false} markClassName="size-8" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Panel Artista</h2>
              <p className="mt-1 text-lg font-semibold text-foreground">@{publicSlug || "artista"}</p>
              {profileFailed && <div role="alert" className="text-xs text-destructive">
                <p>No se pudieron cargar los enlaces de tu perfil.</p>
                <button type="button" onClick={() => setProfileRevision(value => value + 1)} className="min-h-11 underline">Reintentar</button>
              </div>}
            </div>
          </div>
          <button type="button" aria-expanded={mobileNavigation} aria-controls="artist-navigation" onClick={() => setMobileNavigation(value => !value)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-4 py-2 text-sm font-semibold md:hidden"><span>{mobileNavigation ? "Cerrar navegación" : "Secciones de mi panel"}</span><Menu aria-hidden="true" className="size-4" /></button>
          <nav id="artist-navigation" aria-label="Panel del artista" className={`${mobileNavigation ? "block" : "hidden"} space-y-1 md:block`}>
            {enlaces.map((enlace) => {
              const activo = pathname === enlace.href;
              const Icon = enlace.icon;
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-current={activo ? "page" : undefined}
                  onClick={() => setMobileNavigation(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    activo
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{enlace.name}</span>
                  {enlace.href === "/perfil/notificaciones" && unreadCount === null && (
                    <span className="text-xs" title={countFailed ? "No se pudo consultar el total. Abre las notificaciones para revisar." : countLoading ? "Consultando pendientes" : "Total no disponible"}>
                      <span aria-hidden="true">{countLoading ? "…" : "?"}</span>
                      <span className="sr-only">{countFailed ? "Total de pendientes no disponible" : countLoading ? "Consultando pendientes" : "Total no disponible"}</span>
                    </span>
                  )}
                  {!!enlace.badge && (
                    <span className="flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                      {enlace.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={`${mobileNavigation ? "block" : "hidden"} mt-6 space-y-2 md:block`}>
          <Link
            href="/legal"
            className="block px-4 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Términos, privacidad y derechos de autor
          </Link>
          <button
            onClick={cerrarSesion}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:border-destructive/30 hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            <span>{signingOut ? "Cerrando sesión…" : "Cerrar Sesión"}</span>
          </button>
          {sessionError && <p role="alert" className="px-4 text-sm text-destructive">{sessionError}</p>}
        </div>
      </aside>
      <main id="panel-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto bg-card/20">{children}</main>
    </div>
  );
}

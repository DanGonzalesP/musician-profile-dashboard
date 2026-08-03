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
  Package,
  Palette,
  Scale,
  Settings,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchIncomingCreditRequests } from "@/lib/credit-requests";
import { fetchUnreadQuestionCount } from "@/lib/profile-questions";
import { Logo } from "@/components/logo";

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [publicSlug, setPublicSlug] = useState("");
  // "Grupos Musicales" solo se muestra si el artista ya creó más de un
  // grupo — con uno solo (el caso normal) el link sobra en el panel.
  const [ownedBandCount, setOwnedBandCount] = useState(0);
  // Total de notificaciones sin resolver — solicitudes de crédito pendientes
  // + preguntas de visitantes sin leer — para el badge del link de abajo.
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();

      // Sin sesión no hay perfil que resolver. Antes se caía al perfil
      // semilla PROFILE_ID, lo que hacía que dos visitantes anónimos
      // compartieran (y pudieran pisar) los mismos datos. Ver PLAN.md §1.3.
      if (!user) {
        setPublicSlug("");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("user_id", user.id)
        .maybeSingle();

      const profileId = profile?.id ?? null;

      // El enlace publico es el username real, no un slug derivado del
      // nombre (que no es unico y cambia). Ver lib/username.ts.
      setPublicSlug(profile?.username ?? "");

      if (user) {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", user.id)
          .eq("profile_type", "band");
        setOwnedBandCount(count ?? 0);
      }

      if (profileId) {
        const [creditRequests, unreadQuestions] = await Promise.all([
          fetchIncomingCreditRequests(profileId).catch(() => []),
          fetchUnreadQuestionCount(profileId).catch(() => 0),
        ]);
        setUnreadCount(creditRequests.filter((r) => r.status === "pending").length + unreadQuestions);
      }
    }
    cargarPerfil();
  }, []);

  const enlaces: { name: string; href: string; icon: LucideIcon; badge?: number }[] = [
    { name: "Editor de Página", href: "/dashboard", icon: Palette },
    { name: "Ver Portal Público", href: publicSlug ? `/${publicSlug}` : "#", icon: Globe },
    { name: "Métricas / Dashboard", href: "/perfil/dashboard", icon: BarChart3 },
    ...(ownedBandCount > 1 ? [{ name: "Grupos Musicales", href: "/perfil/banda", icon: Users }] : []),
    { name: "Notificaciones", href: "/perfil/notificaciones", icon: Bell, badge: unreadCount },
    { name: "Historial de Pedidos", href: "/perfil/pedidos", icon: Package },
    { name: "Gestionar Merch", href: "/perfil/admin-merch", icon: Shirt },
    { name: "Gestionar Servicios", href: "/perfil/admin-servicios", icon: Briefcase },
    { name: "Herramientas Legales", href: "/perfil/legal", icon: Scale },
    { name: "Configurar Perfil", href: "/perfil/config", icon: Settings },
  ];

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <aside className="glass-panel w-full shrink-0 border-b border-sidebar-border p-6 flex flex-col justify-between md:w-64 md:border-b-0 md:border-r">
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
            </div>
          </div>
          <nav className="space-y-1">
            {enlaces.map((enlace) => {
              const activo = pathname === enlace.href;
              const Icon = enlace.icon;
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    activo
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{enlace.name}</span>
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
        <div className="mt-6 space-y-2">
          <Link
            href="/legal"
            className="block px-4 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Términos, privacidad y derechos de autor
          </Link>
          <button
            onClick={cerrarSesion}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:border-destructive/30 hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-card/20">{children}</main>
    </div>
  );
}

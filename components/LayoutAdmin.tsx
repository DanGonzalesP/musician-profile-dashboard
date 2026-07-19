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
  Music,
  Package,
  Palette,
  Scale,
  Settings,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import { Logo } from "@/components/logo";

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [publicSlug, setPublicSlug] = useState("");

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user?.id ?? PROFILE_ID)
        .maybeSingle();

      let name = profile?.display_name || "";

      // Si el usuario logueado todavía no tiene su propia fila en `profiles`
      // (el editor visual sigue publicando bajo el perfil semilla PROFILE_ID),
      // usamos ese perfil semilla como respaldo para no dejar el enlace roto.
      if (!name && user) {
        const { data: seedProfile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", PROFILE_ID)
          .maybeSingle();
        name = seedProfile?.display_name || "";
      }

      setPublicSlug(name.trim().toLowerCase().replace(/\s+/g, "-"));
    }
    cargarPerfil();
  }, []);

  const enlaces: { name: string; href: string; icon: LucideIcon }[] = [
    { name: "Editor de Página", href: "/dashboard", icon: Palette },
    { name: "Ver Portal Público", href: publicSlug ? `/${publicSlug}` : "#", icon: Globe },
    { name: "Métricas / Dashboard", href: "/perfil/dashboard", icon: BarChart3 },
    { name: "Grupos Musicales", href: "/perfil/banda", icon: Users },
    { name: "Notificaciones de Créditos", href: "/perfil/notificaciones", icon: Bell },
    { name: "Historial de Pedidos", href: "/perfil/pedidos", icon: Package },
    { name: "Gestionar Merch", href: "/perfil/admin-merch", icon: Shirt },
    { name: "Gestionar Servicios", href: "/perfil/admin-servicios", icon: Briefcase },
    { name: "Feed de Música", href: "/perfil/admin-musica", icon: Music },
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
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver al Feed
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
                  <span>{enlace.name}</span>
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

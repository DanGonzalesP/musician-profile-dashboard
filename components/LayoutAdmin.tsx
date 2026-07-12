"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const enlaces = [
    { name: "Ver Portal Público", href: "/perfil/donaciones", icon: "🌐" },
    { name: "Métricas / Dashboard", href: "/perfil/dashboard", icon: "📈" },
    { name: "Historial de Pedidos", href: "/perfil/pedidos", icon: "📊" },
    { name: "Gestionar Merch", href: "/perfil/admin-merch", icon: "👕" },
    { name: "Gestionar Servicios", href: "/perfil/admin-servicios", icon: "💼" },
    { name: "Configurar Perfil", href: "/perfil/config", icon: "⚙" },
  ];

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-zinc-950 border-r border-zinc-800 p-6 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Panel Artista</h2>
            <p className="text-lg font-semibold text-white mt-1">@novareyes</p>
          </div>
          <nav className="space-y-1">
            {enlaces.map((enlace) => {
              const activo = pathname === enlace.href;
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activo ? "bg-amber-500 text-zinc-950 font-bold" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  <span>{enlace.icon}</span>
                  <span>{enlace.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={cerrarSesion}
          className="mt-6 w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors border border-transparent hover:border-red-900/30"
        >
          <span>🚪</span>
          <span>Cerrar Sesión</span>
        </button>
      </aside>
      <main className="flex-1 bg-zinc-900/40 overflow-y-auto">{children}</main>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ ventas: 0, donaciones: 0, totalPedidos: 0 });
  const [donacionesRecientes, setDonacionesRecientes] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function cargarEstadisticas() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: artist } = await supabase.from("artist").select("id, total_donations").eq("username", "novareyes").single();
      
      if (artist) {
        const { data: orders } = await supabase.from("orders").select("price_paid").eq("artist_id", artist.id);
        const { data: recentDonations } = await supabase.from("donations").select("*").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(3);

        const totalVentas = orders?.reduce((sum, o) => sum + Number(o.price_paid), 0) || 0;

        setStats({
          ventas: totalVentas,
          donaciones: artist.total_donations || 0,
          totalPedidos: orders?.length || 0
        });
        if (recentDonations) setDonacionesRecientes(recentDonations);
      }
      setLoading(false);
    }
    cargarEstadisticas();
  }, [router]);

  if (loading) return <div className="p-6 text-center text-white">Cargando métricas...</div>;

  const totalGeneral = stats.ventas + stats.donaciones;
  const porcVentas = totalGeneral > 0 ? (stats.ventas / totalGeneral) * 100 : 0;
  const porcDonaciones = totalGeneral > 0 ? (stats.donaciones / totalGeneral) * 100 : 0;

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Resumen del Negocio</h1>
          <p className="text-zinc-400 text-xs mt-1">Métricas clave de rendimiento y flujos de ingresos actuales.</p>
        </header>

        {/* TARJETAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Ventas por Tienda</span>
            <p className="text-2xl font-black text-amber-400 mt-1">${stats.ventas.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Aportes Recibidos</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">${stats.donaciones.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Órdenes Totales</span>
            <p className="text-2xl font-black text-purple-400 mt-1">{stats.totalPedidos} u</p>
          </div>
        </div>

        {/* GRÁFICO ESTADÍSTICO NATIVO */}
        <section className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <h2 className="text-sm font-bold text-zinc-300">Distribución de Ingresos</h2>
          <div className="w-full bg-zinc-900 h-6 rounded-full overflow-hidden flex">
            <div style={{ width: `${porcVentas}%` }} className="bg-amber-500 h-full transition-all" title="Ventas" />
            <div style={{ width: `${porcDonaciones}%` }} className="bg-emerald-500 h-full transition-all" title="Donaciones" />
          </div>
          <div className="flex space-x-6 text-xs font-medium">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-amber-500 rounded-sm" />
              <span className="text-zinc-400">Merch/Servicios ({porcVentas.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
              <span className="text-zinc-400">Donaciones ({porcDonaciones.toFixed(1)}%)</span>
            </div>
          </div>
        </section>

        {/* ÚLTIMOS APORTES */}
        <section className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <h2 className="text-sm font-bold text-zinc-300">Donaciones Recientes</h2>
          <div className="space-y-2">
            {donacionesRecientes.map((d) => (
              <div key={d.id} className="flex justify-between items-center bg-zinc-900/50 p-3 rounded border border-zinc-800/60 text-xs">
                <div>
                  <p className="font-bold text-white">{d.donor_name}</p>
                  {d.message && <p className="text-zinc-400 mt-0.5">"{d.message}"</p>}
                </div>
                <span className="font-bold text-emerald-400">+${Number(d.amount).toFixed(2)}</span>
              </div>
            ))}
            {donacionesRecientes.length === 0 && (
              <p className="text-zinc-600 text-xs italic py-2">No hay aportes registrados.</p>
            )}
          </div>
        </section>
      </div>
    </LayoutAdmin>
  );
}
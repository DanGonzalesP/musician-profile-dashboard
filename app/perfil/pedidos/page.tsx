"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";

interface OrderItem {
  id: number;
  customer_name: string;
  item_type: string;
  item_title: string;
  price_paid: number;
  currency: string;
  created_at: string;
}

export default function HistorialPedidosPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const router = useRouter();

  useEffect(() => {
    async function inicializarHistorial() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: artist } = await supabase.from("artist").select("id").eq("username", "novareyes").single();
      if (artist) {
        const { data: ordersData } = await supabase
          .from("orders")
          .select("*")
          .eq("artist_id", artist.id)
          .order("created_at", { ascending: false });
        if (ordersData) setOrders(ordersData as OrderItem[]);
      }
      setLoading(false);
    }
    inicializarHistorial();
  }, [router]);

  const ordenesFiltradas = orders.filter((o) => {
    const coincideBusqueda = o.item_title.toLowerCase().includes(busqueda.toLowerCase()) || o.customer_name.toLowerCase().includes(busqueda.toLowerCase());
    const coincideFiltro = filtroTipo === "todos" || o.item_type === filtroTipo;
    return coincideBusqueda && coincideFiltro;
  });

  const totalRecaudado = ordenesFiltradas.reduce((sum, o) => sum + Number(o.price_paid), 0);

  if (loading) return <div className="p-6 text-white text-center">Cargando historial de pedidos...</div>;

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b border-zinc-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Historial de Ventas y Servicios</h1>
            <p className="text-zinc-400 text-xs mt-1">Monitorea tus ingresos y solicitudes recibidas.</p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-3 text-right">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">Recaudación Total (Filtro)</span>
            <span className="text-xl font-black text-emerald-400">${totalRecaudado.toFixed(2)}</span>
          </div>
        </header>

        {/* CONTROLES DE BUSQUEDA Y FILTRO */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Buscar por concepto o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="todos">Todos los tipos</option>
            <option value="merch">Solo Mercadería</option>
            <option value="servicio">Solo Servicios</option>
          </select>
        </div>

        {/* TABLA */}
        <section className="space-y-4">
          {ordenesFiltradas.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-xs font-semibold uppercase">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Concepto</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4 text-right">Monto Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {ordenesFiltradas.map((order) => (
                    <tr key={order.id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="p-4 text-zinc-400 text-xs">
                        {new Date(order.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td className="p-4 font-medium text-white">
                        {order.item_title}
                        <span className="block text-[11px] text-zinc-500 font-normal">Por: {order.customer_name}</span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                          order.item_type === "merch" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        }`}>{order.item_type === "merch" ? "Merch" : "Servicio"}</span>
                      </td>
                      <td className="p-4 text-right font-bold text-emerald-400">${Number(order.price_paid).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">No se encontraron transacciones con los filtros aplicados.</p>
          )}
        </section>
      </div>
    </LayoutAdmin>
  );
}
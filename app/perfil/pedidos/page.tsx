"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import LayoutAdmin from "@/components/LayoutAdmin";
import { Loader2 } from "lucide-react";

interface PedidoItem {
  id: string;
  quantity: number;
  price_at_purchase: number;
  product_title: string;
  order_created_at: string;
  order_status: string | null;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  price_at_purchase: number;
  products: { title: string } | null;
  orders: { created_at: string; status: string | null } | null;
}

export default function HistorialPedidosPage() {
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [errorMensaje, setErrorMensaje] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function cargarHistorial() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMensaje(profileError.message);
        setLoading(false);
        return;
      }

      const profileId = profile?.id ?? PROFILE_ID;

      const { data, error } = await supabase
        .from("order_items")
        .select("id, quantity, price_at_purchase, products!inner(title, seller_id), orders(created_at, status)")
        .eq("products.seller_id", profileId)
        .order("id", { ascending: false });

      if (error) {
        setErrorMensaje(error.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as unknown as OrderItemRow[];
      const parsed: PedidoItem[] = rows.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        price_at_purchase: row.price_at_purchase,
        product_title: row.products?.title ?? "Producto eliminado",
        order_created_at: row.orders?.created_at ?? "",
        order_status: row.orders?.status ?? null,
      }));

      setPedidos(parsed);
      setLoading(false);
    }
    cargarHistorial();
  }, [router]);

  const pedidosFiltrados = pedidos.filter((p) =>
    p.product_title.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalRecaudado = pedidosFiltrados.reduce(
    (sum, p) => sum + Number(p.price_at_purchase) * p.quantity,
    0
  );

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b border-zinc-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Historial de Pedidos</h1>
            <p className="text-zinc-400 text-xs mt-1">Ventas de productos registradas a través de tu tienda.</p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-3 text-right">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">Recaudación Total (Filtro)</span>
            <span className="text-xl font-black text-emerald-400">${totalRecaudado.toFixed(2)}</span>
          </div>
        </header>

        {errorMensaje && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
            {errorMensaje}
          </div>
        )}

        <input
          type="text"
          placeholder="Buscar por producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
        />

        <section className="space-y-4">
          {pedidosFiltrados.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-xs font-semibold uppercase">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Producto</th>
                    <th className="p-4">Cantidad</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {pedidosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="p-4 text-zinc-400 text-xs">
                        {p.order_created_at
                          ? new Date(p.order_created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="p-4 font-medium text-white">{p.product_title}</td>
                      <td className="p-4 text-zinc-300">{p.quantity}</td>
                      <td className="p-4">
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {p.order_status ?? "pendiente"}
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-emerald-400">
                        ${(Number(p.price_at_purchase) * p.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">
              No se encontraron pedidos todavía.
            </p>
          )}
        </section>
      </div>
    </LayoutAdmin>
  );
}

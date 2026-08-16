"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { mensajeDeErrorDeConsulta } from "@/lib/errores-de-consulta";
import { Loader2 } from "lucide-react";

interface OrderItemRow {
  quantity: number;
  price_at_purchase: number;
  products: { seller_id: string } | null;
}

interface DonationRow {
  amount: number | null;
  artist_net: number | null;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState(0);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [donaciones, setDonaciones] = useState(0);
  const [errorMensaje, setErrorMensaje] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function cargarEstadisticas() {
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
        // Nunca el texto de Postgres en pantalla: ver lib/errores-de-consulta.ts.
        setErrorMensaje(mensajeDeErrorDeConsulta(profileError, "tu perfil"));
        setLoading(false);
        return;
      }

      // Sin fila de perfil no se sigue: antes se caía al perfil semilla
      // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
      if (!profile) {
        setErrorMensaje("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
        setLoading(false);
        return;
      }
      const profileId = profile.id;

      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, price_at_purchase, products!inner(seller_id)")
        .eq("products.seller_id", profileId);

      if (error) {
        // `order_items` no existe en esta base (P-03). En vez de cortar el
        // dashboard entero con un error de Postgres en pantalla, se avisa en
        // la voz del producto y se siguen mostrando el resto de las cifras.
        setErrorMensaje(mensajeDeErrorDeConsulta(error, "el resumen de ventas"));
        setVentas(0);
        setTotalPedidos(0);
      } else {
        const rows = (data ?? []) as unknown as OrderItemRow[];
        const totalVentas = rows.reduce((sum, r) => sum + Number(r.price_at_purchase) * r.quantity, 0);

        setVentas(totalVentas);
        setTotalPedidos(rows.length);
      }

      const { data: donationRows, error: donationsError } = await supabase
        .from("donations")
        .select("amount, artist_net")
        .eq("profile_id", profileId);

      if (!donationsError) {
        const totalDonaciones = ((donationRows ?? []) as DonationRow[]).reduce(
          (sum, d) => sum + Number(d.artist_net ?? d.amount ?? 0),
          0
        );
        setDonaciones(totalDonaciones);
      }
      // Si `donations.profile_id` todavía no existe (migración no aplicada),
      // donationsError se ignora y las donaciones quedan en 0 en vez de romper el dashboard.

      setLoading(false);
    }
    cargarEstadisticas();
  }, [router]);

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
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Resumen del Negocio</h1>
          <p className="text-zinc-400 text-xs mt-1">Métricas clave de rendimiento y flujos de ingresos actuales.</p>
        </header>

        {errorMensaje && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
            {errorMensaje}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">Ventas Totales</span>
            <span className="text-2xl font-black text-emerald-400">${ventas.toFixed(2)}</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">Pedidos Registrados</span>
            <span className="text-2xl font-black text-white">{totalPedidos}</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">Donaciones</span>
            <span className="text-2xl font-black text-emerald-400">${donaciones.toFixed(2)}</span>
          </div>
        </div>

        <section className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
          <p className="text-sm text-zinc-400">
            Ventas y pedidos provienen de `order_items`/`orders`. Donaciones provienen de `donations.profile_id`.
            Todas aparecerán en cero hasta que existan transacciones reales vinculadas a tu perfil.
          </p>
        </section>
      </div>
    </LayoutAdmin>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { esTablaAusente, mensajeDeErrorDeConsulta } from "@/lib/errores-de-consulta";
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
  const [retry, setRetry] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let invalidated = false;
    let owner: string | null | undefined;
    const controller = new AbortController();
    const isCurrent = () => active && !invalidated;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isCurrent()) return;
      const nextOwner = session?.user.id ?? null;
      if (owner !== undefined && owner !== nextOwner) {
        invalidated = true;
        controller.abort();
        setPedidos([]);
        setBusqueda("");
        setErrorMensaje("");
        setSessionChanged(true);
        setLoading(false);
      }
      owner = nextOwner;
    });
    async function cargarHistorial() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (authError) throw authError;
      if (!user) {
        router.push("/login");
        return;
      }
      if (owner !== undefined && owner !== user.id) throw new Error("Sesión no disponible");
      owner = user.id;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (sessionError || sessionData.session?.user.id !== user.id) throw new Error("Sesión no disponible");
      const accessToken = sessionData.session.access_token;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .abortSignal(controller.signal).maybeSingle()
        .setHeader("Authorization", `Bearer ${accessToken}`);

      if (!isCurrent()) return;
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
        .select("id, quantity, price_at_purchase, products!inner(title, seller_id), orders(created_at, status)")
        .eq("products.seller_id", profileId)
        .order("id", { ascending: false })
        .setHeader("Authorization", `Bearer ${accessToken}`)
        .abortSignal(controller.signal);

      if (!isCurrent()) return;
      if (error) {
        // `order_items` no existe en esta base (P-03): hasta que se decida si
        // el modelo de pedidos se implementa o la pantalla se retira, el
        // artista ve una frase honesta y no `relation ... does not exist`.
        if (esTablaAusente(error)) {
          setUnavailable(true);
          setPedidos([]);
          setErrorMensaje("");
        } else {
          setErrorMensaje(mensajeDeErrorDeConsulta(error, "el historial de pedidos"));
        }
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
    void cargarHistorial().catch(() => {
      if (!isCurrent()) return;
      setErrorMensaje("No pudimos cargar el historial. Revisa tu conexión e inténtalo de nuevo.");
      setLoading(false);
    });
    return () => { active = false; controller.abort(); listener.subscription.unsubscribe(); };
  }, [router, retry]);

  const pedidosFiltrados = pedidos.filter((p) =>
    p.product_title.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (sessionChanged) {
    return <LayoutAdmin><main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">La cuenta cambió</h1>
      <p role="status">Cerramos el historial de la cuenta anterior. Vuelve a cargar para continuar con la cuenta actual.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-4">Cargar la cuenta actual</button>
    </main></LayoutAdmin>;
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          Cargando historial…
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  if (unavailable) {
    return <LayoutAdmin><main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">Pedidos</h1>
      <p>El historial de pedidos dentro de Vibe todavía no está disponible.</p>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Compras y reservas mediante enlaces externos</h2>
        <p className="text-sm text-muted-foreground">Puedes añadir enlaces de compra a tus productos y de reserva a tus servicios. Consulta los pedidos, pagos, cancelaciones y devoluciones en el servicio al que dirige cada enlace; Vibe no los recibe automáticamente.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/perfil/admin-merch" className="inline-flex min-h-11 items-center rounded-lg border px-4">Gestionar productos</Link>
          <Link href="/perfil/admin-servicios" className="inline-flex min-h-11 items-center rounded-lg border px-4">Gestionar servicios</Link>
        </div>
      </div>
    </main></LayoutAdmin>;
  }

  return (
    <LayoutAdmin>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b border-border pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Historial de Pedidos</h1>
            <p className="text-muted-foreground text-xs mt-1">Consulta las líneas de pedido registradas para tus productos. Estos registros no confirman dinero cobrado ni saldo disponible.</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-3 text-right">
            <span className="block text-[10px] font-bold text-muted-foreground uppercase">Líneas de pedido (filtro)</span>
            <span className="text-xl font-black text-primary">{errorMensaje ? "No disponible" : pedidosFiltrados.length}</span>
          </div>
        </header>

        {errorMensaje && (
          <div role="alert" className="p-4 rounded-md border bg-destructive/10 border-destructive/20 text-destructive text-sm">
            {errorMensaje}
            <button type="button" onClick={() => { setLoading(true); setErrorMensaje(""); setRetry(value => value + 1); }} className="mt-3 block min-h-11 rounded-lg border border-current px-3">Reintentar</button>
          </div>
        )}

        <input
          type="text"
          aria-label="Buscar pedidos por producto"
          disabled={!!errorMensaje}
          placeholder="Buscar por producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-card border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
        />

        {!errorMensaje && <section className="space-y-4">
          <p className="text-xs text-muted-foreground">Importes históricos según el registro. La moneda no está identificada; no se suman entre sí.</p>
          {pedidosFiltrados.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs font-semibold uppercase">
                    <th scope="col" className="p-4">Fecha</th>
                    <th scope="col" className="p-4">Producto</th>
                    <th scope="col" className="p-4">Cantidad</th>
                    <th scope="col" className="p-4">Estado</th>
                    <th scope="col" className="p-4 text-right">Importe registrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-muted-foreground text-xs">
                        {p.order_created_at
                          ? new Date(p.order_created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="p-4 font-medium text-foreground">{p.product_title}</td>
                      <td className="p-4 text-foreground">{p.quantity}</td>
                      <td className="p-4">
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-primary/10 text-foreground border border-primary/20">
                          {p.order_status ?? "Sin estado registrado"}
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-foreground">
                        {Number.isFinite(Number(p.price_at_purchase) * p.quantity) ? (Number(p.price_at_purchase) * p.quantity).toFixed(2) : "No disponible"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8 bg-card rounded-xl border border-border">
              {busqueda ? "No hay resultados para esta búsqueda." : "Todavía no hay pedidos registrados."}
              {busqueda && <button type="button" onClick={() => setBusqueda("")} className="mx-auto mt-2 block min-h-11 px-3 text-primary underline">Limpiar búsqueda</button>}
            </p>
          )}
        </section>}
      </div>
    </LayoutAdmin>
  );
}

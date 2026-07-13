"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import LayoutAdmin from "@/components/LayoutAdmin";
import { Loader2 } from "lucide-react";

interface MerchItem {
  id: string;
  title: string;
  price: number;
  stock_quantity: number;
}

export default function AdminMerchPage() {
  const [products, setProducts] = useState<MerchItem[]>([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [errorMensaje, setErrorMensaje] = useState("");
  const router = useRouter();

  const cargarProductos = async (id: string) => {
    const { data, error } = await supabase
      .from("products")
      .select("id, title, price, stock_quantity")
      .eq("seller_id", id)
      .order("position_index", { ascending: true });

    if (error) {
      setErrorMensaje(error.message);
    } else if (data) {
      setProducts(data as MerchItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    async function verificarSesion() {
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

      const id = profile?.id ?? PROFILE_ID;
      setProfileId(id);
      cargarProductos(id);
    }
    verificarSesion();
  }, [router]);

  const agregarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price || !stock || !profileId) return;

    const { error } = await supabase.from("products").insert([
      {
        seller_id: profileId,
        type: "merch",
        title,
        price: parseFloat(price),
        stock_quantity: parseInt(stock, 10),
      },
    ]);

    if (error) {
      setErrorMensaje(error.message);
    } else {
      setTitle("");
      setPrice("");
      setStock("");
      cargarProductos(profileId);
    }
  };

  const actualizarStock = async (id: string, nuevoStock: number) => {
    if (!profileId || nuevoStock < 0) return;

    const { error } = await supabase
      .from("products")
      .update({ stock_quantity: nuevoStock })
      .eq("id", id);

    if (error) setErrorMensaje(error.message);
    else cargarProductos(profileId);
  };

  const actualizarPrecio = async (id: string, nuevoPrecio: number) => {
    if (!profileId || isNaN(nuevoPrecio) || nuevoPrecio < 0) return;

    const { error } = await supabase
      .from("products")
      .update({ price: nuevoPrecio })
      .eq("id", id);

    if (error) setErrorMensaje(error.message);
    else cargarProductos(profileId);
  };

  const eliminarProducto = async (id: string) => {
    if (!profileId) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) setErrorMensaje(error.message);
    else cargarProductos(profileId);
  };

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
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Gestionar Mercadería</h1>
          <p className="text-zinc-400 text-xs mt-1">Añade nuevos artículos o edita el stock de tu tienda.</p>
        </header>

        {errorMensaje && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
            {errorMensaje}
          </div>
        )}

        <form onSubmit={agregarProducto} className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nombre del Producto</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="Polera Oficial"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Precio ($ USD)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="25.00"
              required
            />
          </div>
          <div className="flex space-x-2">
            <div className="w-full">
              <label className="block text-xs text-zinc-400 mb-1">Stock Inicial</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="50"
                required
              />
            </div>
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-sm px-4 h-9 rounded transition-colors self-end">
              Añadir
            </button>
          </div>
        </form>

        <section className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-xs font-semibold uppercase">
                <th className="p-4">Producto</th>
                <th className="p-4">Precio</th>
                <th className="p-4">Stock Disponible</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {products.map((prod) => (
                <tr key={prod.id} className="hover:bg-zinc-900/20">
                  <td className="p-4 font-medium text-white">{prod.title}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-1">
                      <span className="text-zinc-500 text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={Number(prod.price).toFixed(2)}
                        onBlur={(e) => actualizarPrecio(prod.id, parseFloat(e.target.value))}
                        className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => actualizarStock(prod.id, prod.stock_quantity - 1)}
                        disabled={prod.stock_quantity <= 0}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                      >
                        -
                      </button>
                      <span className={`font-bold w-12 text-center ${prod.stock_quantity === 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {prod.stock_quantity} uds
                      </span>
                      <button
                        onClick={() => actualizarStock(prod.id, prod.stock_quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => eliminarProducto(prod.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-red-950/40 text-red-400 border border-red-900/30 hover:bg-red-900/40 transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-zinc-500 italic">
                    No has registrado productos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </LayoutAdmin>
  );
}

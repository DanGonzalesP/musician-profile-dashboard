"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface MerchItem {
  id: number;
  title: string;
  description: string;
  price: number;
  stock: number;
  currency: string;
}

export default function MerchPage() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [mensaje, setMensaje] = useState("");

  const router = useRouter();

  useEffect(() => {
    async function inicializarMerch() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: artist } = await supabase
        .from("artist")
        .select("id")
        .eq("username", "novareyes")
        .single();

      if (artist) {
        setArtistId(artist.id);
        const { data: items } = await supabase
          .from("merch")
          .select("*")
          .eq("artist_id", artist.id);
        if (items) setMerchItems(items as MerchItem[]);
      }
      setLoading(false);
    }
    inicializarMerch();
  }, [router]);

  const formatearDecimales = () => {
    if (price && !isNaN(Number(price))) {
      setPrice(Number(price).toFixed(2));
    }
  };

  const agregarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!artistId) {
      setMensaje("Cargando credenciales del artista... Intenta un segundo después.");
      return;
    }

    setCreating(true);
    setMensaje("");

    const nuevoItem = {
      artist_id: artistId,
      title,
      description,
      price: parseFloat(price),
      stock: parseInt(stock, 10),
      currency,
    };

    const { data, error } = await supabase
      .from("merch")
      .insert([nuevoItem])
      .select();

    setCreating(false);

    if (error) {
      setMensaje("Hubo un error al registrar el producto.");
    } else {
      setMensaje("¡Producto añadido con éxito!");
      if (data) {
        setMerchItems((prev) => [...prev, data[0] as MerchItem]);
      }
      setTitle("");
      setDescription("");
      setPrice("");
      setStock("");
    }
  };

  if (loading) return <div className="p-6 text-white text-center">Cargando tienda...</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto text-white space-y-8">
      <section className="space-y-4 bg-zinc-950 p-6 rounded-xl border border-zinc-800">
        <header className="border-b border-zinc-800 pb-3">
          <h1 className="text-2xl font-bold">Añadir Producto a la Tienda</h1>
        </header>

        <form onSubmit={agregarProducto} className="space-y-4">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Nombre del producto" required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" rows={3} placeholder="Descripción" required />
          
          <div className="grid grid-cols-3 gap-4">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 h-10">
              <option value="USD">Dólares ($)</option>
              <option value="PEN">Soles (S/.)</option>
            </select>
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={formatearDecimales} className="col-span-1 w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 h-10" placeholder="Precio" required />
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="col-span-1 w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 h-10" placeholder="Stock" required />
          </div>

          <button type="submit" disabled={creating} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-sm p-2 rounded transition-colors disabled:opacity-50">
            {creating ? "Guardando..." : "Registrar Producto"}
          </button>

          {mensaje && (
            <p className={`text-center text-xs font-semibold mt-1 ${mensaje.includes("éxito") ? "text-emerald-400" : "text-red-400"}`}>
              {mensaje}
            </p>
          )}
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Productos en Tienda</h2>
        {merchItems.map((item) => (
          <div key={item.id} className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 flex justify-between items-center">
            <div>
              <p className="font-semibold text-amber-500">{item.title}</p>
              <p className="text-xs text-zinc-400">{item.description}</p>
              <p className="text-xs text-zinc-500 mt-1">Stock: {item.stock} unidades</p>
            </div>
            <p className="text-emerald-400 font-bold">
              {item.currency === "PEN" ? "S/." : "$"} {Number(item.price).toFixed(2)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";

interface ServicioItem {
  id: number;
  title: string;
  description: string | null;
  price: number;
}

export default function AdminServiciosPage() {
  const [services, setServices] = useState<ServicioItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<number | null>(null);
  const router = useRouter();

  const cargarServicios = async (id: number) => {
    const { data } = await supabase
      .from("services")
      .select("id, title, description, price")
      .eq("artist_id", id);
    if (data) setServices(data);
    setLoading(false);
  };

  useEffect(() => {
    async function verificarSesion() {
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
        cargarServicios(artist.id);
      } else {
        setLoading(false);
      }
    }
    verificarSesion();
  }, [router]);

  const agregarServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price || !artistId) return;

    const { error } = await supabase.from("services").insert([
      {
        artist_id: artistId,
        title,
        description: description.trim() || null,
        price: parseFloat(price),
      },
    ]);

    if (!error) {
      setTitle("");
      setDescription("");
      setPrice("");
      cargarServicios(artistId);
    }
  };

  const eliminarServicio = async (id: number) => {
    if (!artistId) return;

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id);

    if (!error) {
      cargarServicios(artistId);
    }
  };

  if (loading) return <div className="p-6 text-center text-white">Cargando catálogo de servicios...</div>;

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold">Gestionar Servicios</h1>
          <p className="text-zinc-400 text-xs mt-1">Configura las opciones de contratación y tarifas disponibles en tu perfil público.</p>
        </header>

        <form onSubmit={agregarServicio} className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre del Servicio</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="Ej. Mezcla y Masterización Profesional"
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
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="150.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Descripción corta (Opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="Ej. Entrega en 5 días hábiles, formato WAV de alta calidad."
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" className="bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm px-6 py-2 rounded transition-colors">
              Añadir Servicio
            </button>
          </div>
        </form>

        <section className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-xs font-semibold uppercase">
                <th className="p-4">Servicio</th>
                <th className="p-4">Descripción</th>
                <th className="p-4">Tarifa Estándar</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {services.map((srv) => (
                <tr key={srv.id} className="hover:bg-zinc-900/20">
                  <td className="p-4 font-medium text-white">{srv.title}</td>
                  <td className="p-4 text-zinc-400 text-xs max-w-xs truncate">
                    {srv.description || <span className="text-zinc-600 italic">Sin descripción</span>}
                  </td>
                  <td className="p-4">
  <div className="flex items-center space-x-1">
    <span className="text-zinc-500 text-xs">$</span>
    <input
      type="number"
      step="0.01"
      defaultValue={Number(srv.price).toFixed(2)}
      onBlur={async (e) => {
        const nuevoPrecio = parseFloat(e.target.value);
        if (!isNaN(nuevoPrecio) && nuevoPrecio >= 0 && artistId) {
          await supabase
            .from("services")
            .update({ price: nuevoPrecio })
            .eq("id", srv.id);
          cargarServicios(artistId);
        }
      }}
      className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
    />
  </div>
</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => eliminarServicio(srv.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-red-950/40 text-red-400 border border-red-900/30 hover:bg-red-900/40 transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-zinc-500 italic">
                    No has registrado servicios de contratación todavía.
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
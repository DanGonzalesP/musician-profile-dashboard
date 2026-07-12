"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ServiceItem {
  id: number;
  title: string;
  description: string;
  price: number;
  currency: string;
}

export default function ServiciosPage() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [servicesItems, setServicesItems] = useState<ServiceItem[]>([]);
  
  // Estados para el nuevo servicio
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [mensaje, setMensaje] = useState("");

  const router = useRouter();

  useEffect(() => {
    async function inicializarServicios() {
      // 1. Validar sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // 2. Conseguir ID del artista Nova Reyes
      const { data: artist } = await supabase
        .from("artist")
        .select("id")
        .eq("username", "novareyes")
        .single();

      if (artist) {
        setArtistId(artist.id);

        // 3. Traer los servicios vinculados
        const { data: items } = await supabase
          .from("services")
          .select("*")
          .eq("artist_id", artist.id);

        if (items) setServicesItems(items as ServiceItem[]);
      }
      setLoading(false);
    }
    inicializarServicios();
  }, [router]);

  // Función para formatear a dos decimales al salir del input (onBlur)
  const formatearDecimales = () => {
    if (price && !isNaN(Number(price))) {
      setPrice(Number(price).toFixed(2));
    }
  };

  const agregarServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!artistId) {
      setMensaje("Cargando credenciales del artista... Intenta un segundo después.");
      return;
    }

    setCreating(true);
    setMensaje("");

    const nuevoServicio = {
      artist_id: artistId,
      title,
      description,
      price: parseFloat(price),
      currency,
    };

    const { data, error } = await supabase
      .from("services")
      .insert([nuevoServicio])
      .select();

    setCreating(false);

    if (error) {
      setMensaje("Hubo un error al registrar el servicio. Reintenta por favor.");
    } else {
      setMensaje("¡Servicio añadido con éxito!");
      if (data) {
        setServicesItems((prev) => [...prev, data[0] as ServiceItem]);
      }
      setTitle("");
      setDescription("");
      setPrice("");
    }
  };

  if (loading) {
    return <div className="p-6 text-white text-center">Verificando sesión y cargando servicios...</div>;
  }

  return (
    <div className="p-8 max-w-2xl mx-auto text-white space-y-8">
      {/* SECCIÓN 1: Formulario de Creación */}
      <section className="space-y-4 bg-zinc-950 p-6 rounded-xl border border-zinc-800">
        <header className="border-b border-zinc-800 pb-3">
          <h1 className="text-2xl font-bold">Ofrecer Nuevo Servicio</h1>
          <p className="text-zinc-400 text-xs mt-1">Añade prestaciones musicales, talleres o composiciones a tu portafolio.</p>
        </header>

        <form onSubmit={agregarServicio} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Nombre del Servicio</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="Ej. Taller de décima musical interactivo"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Descripción del Servicio</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
              placeholder="Explica detalladamente en qué consiste el servicio..."
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-zinc-300 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 h-10"
              >
                <option value="USD">Dólares ($)</option>
                <option value="PEN">Soles (S/.)</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1">Precio</label>
              <input 
                type="number" 
                step="0.01"
                value={price} 
                onChange={(e) => setPrice(e.target.value)} 
                onBlur={formatearDecimales}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="150.00"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={creating}
            className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-sm p-2 rounded transition-colors disabled:opacity-50"
          >
            {creating ? "Guardando..." : "Registrar Servicio"}
          </button>

          {mensaje && (
            <p className={`text-center text-xs font-semibold mt-1 ${mensaje.includes("éxito") ? "text-emerald-400" : "text-red-400"}`}>
              {mensaje}
            </p>
          )}
        </form>
      </section>

      {/* SECCIÓN 2: Lista de Servicios */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Servicios Profesionales Configurados</h2>
        {servicesItems && servicesItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {servicesItems.map((service) => (
              <div key={service.id} className="bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-amber-500">{service.title}</h3>
                    <span className="text-base font-bold text-emerald-400">
                      {service.currency === "PEN" ? "S/." : "$"} {Number(service.price).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{service.description}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No hay servicios registrados en este momento.</p>
        )}
      </section>
    </div>
  );
}
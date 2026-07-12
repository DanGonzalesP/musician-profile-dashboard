"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";

export default function ConfigPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [donaciones, setDonaciones] = useState("");
  const [guardado, setGuardado] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: artist } = await supabase.from("artist").select("*").eq("username", "novareyes").single();
      if (artist) {
        setArtistId(artist.id);
        setBio(artist.bio || "");
        setInstagram(artist.instagram_url || "");
        setDonaciones(String(artist.total_donations || 0));
      }
      setLoading(false);
    }
    cargarPerfil();
  }, [router]);

  const guardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artistId) return;

    const { error } = await supabase
      .from("artist")
      .update({
        bio: bio.trim(),
        instagram_url: instagram.trim(),
        total_donations: parseFloat(donaciones) || 0
      })
      .eq("id", artistId);

    if (!error) {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    }
  };

  if (loading) return <div className="p-6 text-center text-white">Cargando configuraciones...</div>;

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-2xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold">Configuración de Perfil</h1>
          <p className="text-zinc-400 text-xs mt-1">Personaliza la información pública que ven los usuarios.</p>
        </header>

        <form onSubmit={guardarCambios} className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Biografía / Descripción del perfil</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
              placeholder="Escribe algo sobre ti..."
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Enlace de Instagram</label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="https://instagram.com/tuusuario"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Ajustar Recaudación de Donaciones ($ USD)</label>
            <input
              type="number"
              step="0.01"
              value={donaciones}
              onChange={(e) => setDonaciones(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {guardado ? <span className="text-xs font-bold text-emerald-400">¡Cambios guardados con éxito!</span> : <div />}
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-sm px-6 py-2 rounded transition-colors">
              Guardar Perfil
            </button>
          </div>
        </form>
      </div>
    </LayoutAdmin>
  );
}
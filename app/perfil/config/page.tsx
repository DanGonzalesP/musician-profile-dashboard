"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import LayoutAdmin from "@/components/LayoutAdmin";
import { Loader2 } from "lucide-react";

export default function ConfigPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [unifiedProfile, setUnifiedProfile] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, bio, unified_profile")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMensaje(profileError.message);
        setLoading(false);
        return;
      }

      if (profile) {
        setProfileId(profile.id);
        setDisplayName(profile.display_name || "");
        setBio(profile.bio || "");
        setUnifiedProfile(Boolean(profile.unified_profile));
      } else {
        setProfileId(PROFILE_ID);
      }
      setLoading(false);
    }
    cargarPerfil();
  }, [router]);

  const guardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        unified_profile: unifiedProfile,
      })
      .eq("id", profileId);

    if (error) {
      setErrorMensaje(error.message);
    } else {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    }
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
      <div className="p-8 max-w-2xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Configuración de Perfil</h1>
          <p className="text-zinc-400 text-xs mt-1">Personaliza la información pública que ven los usuarios.</p>
        </header>

        {errorMensaje && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
            {errorMensaje}
          </div>
        )}

        <form onSubmit={guardarCambios} className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nombre de artista</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="Ej. Nova Reyes"
            />
          </div>

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

          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div>
              <p className="text-sm font-medium text-white">Unificar perfil</p>
              <p className="text-xs text-zinc-400 mt-0.5 max-w-sm">
                Muestra Merch y Servicios junto con tu Perfil, Canciones y Donaciones en una sola página.
                Si está desactivado, Merch y Servicios aparecen en una pestaña aparte.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unifiedProfile}
              onClick={() => setUnifiedProfile((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                unifiedProfile ? "bg-amber-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                  unifiedProfile ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID, normalizeBlockData, getSongOptions, type HeroData, type TracksData } from "@/lib/blocks";
import { fetchLegalSettings, saveLegalSettings, emptyLegalSettings, type LegalSettings } from "@/lib/legal-settings";
import LayoutAdmin from "@/components/LayoutAdmin";
import { LicenseTool } from "@/components/legal/license-tool";
import { LicenseHistoryPanel } from "@/components/legal/license-history-panel";
import { CertificateTool } from "@/components/legal/certificate-tool";
import { Loader2 } from "lucide-react";

export default function HerramientasLegalesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState("");
  const [legalSettings, setLegalSettings] = useState<LegalSettings>(emptyLegalSettings);
  const [songOptions, setSongOptions] = useState<ReturnType<typeof getSongOptions>>([]);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    async function cargar() {
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

      try {
        const settings = await fetchLegalSettings(id);
        setLegalSettings(settings);
      } catch (err) {
        console.error("[HerramientasLegales] No se pudo cargar legal_settings:", err);
      }

      const { data: heroBlock } = await supabase
        .from("profile_blocks")
        .select("content")
        .eq("profile_id", id)
        .eq("block_type", "hero")
        .maybeSingle();
      if (heroBlock) {
        const hero = normalizeBlockData("hero", heroBlock.content) as HeroData;
        setArtistName(hero.name);
      }

      const { data: tracksBlock } = await supabase
        .from("profile_blocks")
        .select("content")
        .eq("profile_id", id)
        .eq("block_type", "tracks")
        .maybeSingle();
      if (tracksBlock) {
        const tracks = normalizeBlockData("tracks", tracksBlock.content) as TracksData;
        setSongOptions(getSongOptions(tracks));
      }

      setLoading(false);
    }
    cargar();
  }, [router]);

  async function handleSaveSettings(next: LegalSettings) {
    if (!profileId) return;
    setSaving(true);
    setSavedMessage(false);
    try {
      await saveLegalSettings(profileId, next);
      setLegalSettings(next);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (err) {
      setErrorMensaje(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

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
          <h1 className="text-2xl font-bold text-white">Herramientas Legales</h1>
          <p className="text-zinc-400 text-xs mt-1">
            Licencias de uso directo y certificados de autoría — herramientas internas para ti, no aparecen en
            tu perfil público.
          </p>
        </header>

        {errorMensaje && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
            {errorMensaje}
          </div>
        )}

        <section className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
          <h2 className="text-sm font-semibold text-white">Tus datos como licenciante</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre artístico</label>
              <input
                type="text"
                value={legalSettings.artistStageName}
                onChange={(e) => setLegalSettings((s) => ({ ...s, artistStageName: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="Nombre con el que te presentas"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre real (legal)</label>
              <input
                type="text"
                value={legalSettings.artistLegalName}
                onChange={(e) => setLegalSettings((s) => ({ ...s, artistLegalName: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="Nombre completo según DNI"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">DNI</label>
              <input
                type="text"
                value={legalSettings.artistDni}
                onChange={(e) => setLegalSettings((s) => ({ ...s, artistDni: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="12345678"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSaveSettings(legalSettings)}
              disabled={saving}
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm px-6 py-2 rounded transition-colors disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar datos"}
            </button>
            {savedMessage && <span className="text-xs text-emerald-400">Guardado ✓</span>}
          </div>
        </section>

        <LicenseTool data={legalSettings} songOptions={songOptions} profileId={profileId ?? undefined} />
        <LicenseHistoryPanel profileId={profileId ?? undefined} />
        <CertificateTool profileId={profileId ?? undefined} artistName={artistName} />
      </div>
    </LayoutAdmin>
  );
}

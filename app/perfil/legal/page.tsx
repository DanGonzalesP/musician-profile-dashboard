"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeBlockData, getSongOptions, type HeroData, type TracksData } from "@/lib/blocks";
import { fetchLegalSettings, saveLegalSettings, emptyLegalSettings, type LegalSettings } from "@/lib/legal-settings";
import LayoutAdmin from "@/components/LayoutAdmin";
import { LicenseTool } from "@/components/legal/license-tool";
import { LicenseHistoryPanel } from "@/components/legal/license-history-panel";
import { CertificateTool } from "@/components/legal/certificate-tool";
import { Loader2 } from "lucide-react";

export default function HerramientasLegalesPage() {
  const router = useRouter();
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setOwner(session?.user.id ?? null);
      if (!session) router.replace("/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);
  if (!owner) return <LayoutAdmin><p role="status" className="p-8">Comprobando sesión…</p></LayoutAdmin>;
  return <LegalAccount key={owner} ownerUserId={owner} />;
}

function LegalAccount({ ownerUserId }: { ownerUserId: string }) {
  const active = useRef(false);
  const saveLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState("");
  const [legalSettings, setLegalSettings] = useState<LegalSettings>(emptyLegalSettings);
  const [songOptions, setSongOptions] = useState<ReturnType<typeof getSongOptions>>([]);
  const [saving, setSaving] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    active.current = true;
    async function cargar() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || data.session?.user.id !== ownerUserId) throw new Error("session");
        const authorization = `Bearer ${data.session.access_token}`;
        const { data: profile, error: profileError } = await supabase
          .from("profiles").select("id").eq("user_id", ownerUserId).maybeSingle()
          .setHeader("Authorization", authorization);
        if (profileError || !profile) throw new Error("profile");
        const [settings, heroResult, tracksResult] = await Promise.all([
          fetchLegalSettings(profile.id, ownerUserId),
          supabase.from("profile_blocks").select("content").eq("profile_id", profile.id)
            .eq("block_type", "hero").maybeSingle().setHeader("Authorization", authorization),
          supabase.from("profile_blocks").select("content").eq("profile_id", profile.id)
            .eq("block_type", "tracks").maybeSingle().setHeader("Authorization", authorization),
        ]);
        if (cancelled) return;
        if (heroResult.error || tracksResult.error) throw new Error("blocks");
        setLegalSettings(settings);
        if (heroResult.data) setArtistName((normalizeBlockData("hero", heroResult.data.content) as HeroData).name);
        if (tracksResult.data) setSongOptions(getSongOptions(normalizeBlockData("tracks", tracksResult.data.content) as TracksData));
        setProfileId(profile.id);
      } catch {
        if (!cancelled) setErrorMensaje("No se pudieron cargar tus datos legales. Recarga la página para volver a intentarlo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void cargar();
    return () => { cancelled = true; active.current = false; };
  }, [ownerUserId]);

  async function handleSaveSettings(next: LegalSettings) {
    if (!profileId || !active.current || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSavedMessage(false);
    setErrorMensaje("");
    try {
      await saveLegalSettings(profileId, next, ownerUserId);
      if (active.current) setSavedMessage(true);
    } catch {
      if (active.current) setErrorMensaje("No se pudo confirmar el guardado. Conservamos lo que escribiste; vuelve a intentarlo.");
    } finally {
      saveLock.current = false;
      if (active.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" aria-label="Cargando datos legales" className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  if (!profileId) return (
    <LayoutAdmin>
      <div className="p-8 space-y-4">
        <p role="alert" className="text-sm text-destructive">{errorMensaje}</p>
        <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-muted" onClick={() => window.location.reload()}>Volver a cargar</button>
      </div>
    </LayoutAdmin>
  );

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="border-b border-border pb-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Herramientas legales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Borradores de licencias y constancias de huella digital — herramientas internas para ti, no aparecen en
            tu perfil público.
          </p>
        </header>

        {errorMensaje && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMensaje}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">Tus datos como licenciante</h2>
            <p className="mt-1 text-xs text-muted-foreground">Se guardan en privado y sólo se usan para completar tus licencias. No aparecen en tu perfil público.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="artistStageName" className="mb-1 block text-xs font-medium text-muted-foreground">Nombre artístico</label>
              <input
                type="text"
                id="artistStageName"
                disabled={saving}
                value={legalSettings.artistStageName}
                onChange={(e) => { setSavedMessage(false); setLegalSettings((s) => ({ ...s, artistStageName: e.target.value })); }}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                placeholder="Nombre con el que te presentas"
              />
            </div>
            <div>
              <label htmlFor="artistLegalName" className="mb-1 block text-xs font-medium text-muted-foreground">Nombre real (legal)</label>
              <input
                type="text"
                id="artistLegalName"
                disabled={saving}
                value={legalSettings.artistLegalName}
                onChange={(e) => { setSavedMessage(false); setLegalSettings((s) => ({ ...s, artistLegalName: e.target.value })); }}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                placeholder="Nombre completo según DNI"
              />
            </div>
            <div>
              <label htmlFor="artistDni" className="mb-1 block text-xs font-medium text-muted-foreground">DNI</label>
              <input
                type="text"
                id="artistDni"
                disabled={saving}
                value={legalSettings.artistDni}
                onChange={(e) => { setSavedMessage(false); setLegalSettings((s) => ({ ...s, artistDni: e.target.value })); }}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                placeholder="12345678"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSaveSettings(legalSettings)}
              disabled={saving}
              className="min-h-11 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar datos"}
            </button>
            {savedMessage && <span role="status" className="text-xs text-foreground">Datos guardados.</span>}
          </div>
        </section>

        <LicenseTool data={legalSettings} songOptions={songOptions} profileId={profileId} ownerUserId={ownerUserId} onRecorded={() => setHistoryRevision((revision) => revision + 1)} />
        <LicenseHistoryPanel key={historyRevision} profileId={profileId ?? undefined} />
        <CertificateTool profileId={profileId} artistName={artistName} ownerUserId={ownerUserId} />
      </div>
    </LayoutAdmin>
  );
}

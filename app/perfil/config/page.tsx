"use client";

// Configuración del perfil. Cambios del gran rediseño:
//  • El idioma (ES/EN) vive aquí, al lado del modo oscuro/claro — ya no en
//    el header del feed.
//  • La descripción/bio desapareció: ahora el músico elige sus ROLES (los 7
//    de lib/musician-roles.ts, selección múltiple) — eso define qué es como
//    músico en toda la plataforma y dónde aparece en el filtro del feed.

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AccentSwatches, AppAccentCard } from "@/components/accent-picker";
import { isAccentColor, type AccentColor } from "@/lib/theme";
import { ensureOwnProfile } from "@/lib/ensure-profile";
import {
  Check,
  Disc3,
  Feather,
  Gem,
  Guitar,
  Layers,
  Loader2,
  Music4,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import {
  MUSICIAN_ROLES,
  parseMusicianRoles,
  type MusicianRole,
} from "@/lib/musician-roles";

const ROLE_ICONS: Record<MusicianRole, ComponentType<{ className?: string }>> = {
  autores: Feather,
  compositores: Music4,
  arreglistas: Layers,
  directores: Wand2,
  productores: Disc3,
  mezclas: SlidersHorizontal,
  masters: Gem,
  musicos: Guitar,
};

export default function ConfigPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [unifiedProfile, setUnifiedProfile] = useState(false);
  const [roles, setRoles] = useState<MusicianRole[]>([]);
  const [profileAccent, setProfileAccent] = useState<AccentColor>("rojo");
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

      // Si la cuenta es nueva y todavía no tiene fila en profiles, se crea
      // aquí mismo — así cualquier persona recién registrada puede
      // configurar su perfil sin pasos manuales.
      const profile = await ensureOwnProfile(user);
      if (!profile) {
        setErrorMensaje("No se pudo cargar tu perfil. Recarga la página.");
        setLoading(false);
        return;
      }

      setProfileId(profile.id);
      setDisplayName(profile.displayName);
      setUnifiedProfile(profile.unifiedProfile);

      // Los roles se consultan aparte: si la migración setup_vibra.sql no
      // corrió todavía, este select falla sin arrastrar al resto.
      const { data: rolesRow } = await supabase
        .from("profiles")
        .select("musician_roles, musician_category")
        .eq("id", profile.id)
        .maybeSingle();
      if (rolesRow) {
        setRoles(parseMusicianRoles(rolesRow.musician_roles ?? rolesRow.musician_category));
      }

      // Igual que los roles: consulta aparte para que una columna faltante
      // (migración setup_vibra.sql sin correr) no rompa el resto.
      const { data: accentRow } = await supabase
        .from("profiles")
        .select("accent_color")
        .eq("id", profile.id)
        .maybeSingle();
      if (accentRow && isAccentColor(accentRow.accent_color)) {
        setProfileAccent(accentRow.accent_color);
      }
      setLoading(false);
    }
    cargarPerfil();
  }, [router]);

  const toggleRole = (role: MusicianRole) => {
    setRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : MUSICIAN_ROLES.map((r) => r.id).filter((id) => id === role || prev.includes(id))
    );
  };

  const guardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;
    setErrorMensaje("");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        unified_profile: unifiedProfile,
      })
      .eq("id", profileId);

    if (error) {
      setErrorMensaje(error.message);
      return;
    }

    // Update aparte por la misma razón que la carga: si la columna todavía
    // no existe en Supabase, no debe bloquear el guardado del resto.
    const { error: rolesError } = await supabase
      .from("profiles")
      .update({ musician_roles: roles })
      .eq("id", profileId);
    if (rolesError) {
      setErrorMensaje(
        "El perfil se guardó, pero los roles no: falta correr supabase/setup_vibra.sql."
      );
      return;
    }

    const { error: accentError } = await supabase
      .from("profiles")
      .update({ accent_color: profileAccent })
      .eq("id", profileId);
    if (accentError) {
      setErrorMensaje(
        "El perfil se guardó, pero el color no: falta correr supabase/setup_vibra.sql."
      );
      return;
    }

    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="mx-auto max-w-2xl space-y-8 p-8">
        <header className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground">Configuración de Perfil</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Personaliza tu identidad, tus roles y cómo se ve la plataforma.
          </p>
        </header>

        {errorMensaje && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMensaje}
          </div>
        )}

        {/* ── Apariencia e idioma ─────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Apariencia e idioma
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemeToggle />
            <div className="flex h-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Idioma</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Español o inglés para toda la interfaz.
                </p>
              </div>
              <LanguageSwitcher />
            </div>
            <AppAccentCard />
          </div>
        </section>

        <form onSubmit={guardarCambios} className="space-y-6 rounded-xl border border-border bg-card p-6">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nombre de artista</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Ej. Nova Reyes"
            />
          </div>

          {/* ── Roles: definen qué eres como músico ───────────────────── */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">¿Qué eres como músico?</label>
            <p className="mb-3 text-[11px] text-muted-foreground/80">
              Elige todos los roles que te definen — no solo dentro de tus canciones, sino como
              profesional. Con ellos te encuentran en el feed principal.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MUSICIAN_ROLES.map((role) => {
                const selected = roles.includes(role.id);
                const Icon = ROLE_ICONS[role.id];
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    aria-pressed={selected}
                    className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_16px_-8px_var(--primary)]"
                        : "border-border bg-background hover:border-primary/30"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        selected
                          ? "border-primary/50 bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>
                        {role.label}
                      </span>
                      <span className="block truncate text-[11px] leading-snug text-muted-foreground">
                        {role.description}
                      </span>
                    </span>
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Acento del perfil público: lo ven todos los visitantes ── */}
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium text-foreground">Color de tu perfil público</p>
            <p className="mb-3 mt-0.5 max-w-sm text-xs text-muted-foreground">
              El acento neón con el que todos ven tu página pública. Es independiente del color que
              elijas para la plataforma.
            </p>
            <AccentSwatches value={profileAccent} onChange={setProfileAccent} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Unificar perfil</p>
              <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">
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
                unifiedProfile ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                  unifiedProfile ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            {guardado ? (
              <span className="text-xs font-bold text-emerald-500">¡Cambios guardados con éxito!</span>
            ) : (
              <div />
            )}
            <button
              type="submit"
              className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Guardar Perfil
            </button>
          </div>
        </form>
      </div>
    </LayoutAdmin>
  );
}

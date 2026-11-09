"use client";

// Configuración del perfil. Cambios del gran rediseño:
//  • El idioma (ES/EN) vive aquí, al lado del modo oscuro/claro — ya no en
//    el header del feed.
//  • La descripción/bio desapareció: ahora el músico elige sus ROLES (los 7
//    de lib/musician-roles.ts, selección múltiple) — eso define qué es como
//    músico en toda la plataforma y dónde aparece en el filtro del feed.

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AccentSwatches, AppAccentCard } from "@/components/accent-picker";
import { isAccentColor, type AccentColor } from "@/lib/theme";
import { ensureOwnProfile } from "@/lib/ensure-profile";
import { isValidUsername, isUsernameAvailable } from "@/lib/username";
import { ZonaDatosPersonales } from "@/components/zona-datos-personales";
import { BlockedProfilesSettings } from "@/components/blocked-profiles-settings";
import { AccountStorageSummary } from "@/components/account-storage-summary";
import { revalidarPerfilPublico } from "@/app/acciones/revalidar-perfil";
import {
  Check,
  Disc3,
  Feather,
  FileMusic,
  Gem,
  Loader2,
  Music4,
  SlidersHorizontal,
  User,
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
  arreglistas: FileMusic,
  directores: Wand2,
  productores: Disc3,
  mezclas: SlidersHorizontal,
  masters: Gem,
  musicos: User,
};

function settingsSnapshot(name: string, alias: string, unified: boolean, roles: MusicianRole[], accent: AccentColor) {
  return JSON.stringify([name, alias, unified, [...roles].sort(), accent]);
}

export default function ConfigPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [unifiedProfile, setUnifiedProfile] = useState(false);
  const [roles, setRoles] = useState<MusicianRole[]>([]);
  const [profileAccent, setProfileAccent] = useState<AccentColor>("rojo");
  const [username, setUsername] = useState("");
  const [usernameOriginal, setUsernameOriginal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guardadoEnCurso = useRef(false);
  const [guardado, setGuardado] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [requiereRecarga, setRequiereRecarga] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const [savedSettings, setSavedSettings] = useState<string | null>(null);
  const settingsRevision = useRef<number | null>(null);
  const hasUnsavedChanges = savedSettings !== null && savedSettings !== settingsSnapshot(displayName, username, unifiedProfile, roles, profileAccent);
  const sessionContext = useRef<{ owner: string | null | undefined; invalidated: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!hasUnsavedChanges && !guardando) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges, guardando]);

  useEffect(() => {
    let active = true;
    const context: { owner: string | null | undefined; invalidated: boolean } = { owner: undefined, invalidated: false };
    sessionContext.current = context;
    const invalidate = () => {
      if (!active) return;
      context.invalidated = true;
      setSessionChanged(true);
      setGuardado(false);
      setLoading(false);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (context.owner !== undefined && context.owner !== next) invalidate();
      context.owner = next;
    });
    const stillCurrent = (owner: string) => {
      if (!active || context.invalidated) return false;
      if (context.owner !== undefined && context.owner !== owner) { invalidate(); return false; }
      context.owner = owner;
      return true;
    };
    async function cargarPerfil() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }
      if (!stillCurrent(user.id)) return;

      // Si la cuenta es nueva y todavía no tiene fila en profiles, se crea
      // aquí mismo — así cualquier persona recién registrada puede
      // configurar su perfil sin pasos manuales.
      const profile = await ensureOwnProfile(user);
      if (!stillCurrent(user.id)) return;
      if (!profile) {
        throw new Error("No se pudo cargar tu perfil.");
      }

      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      if (!stillCurrent(user.id)) return;
      if (sessionError || !auth.session || auth.session.user.id !== user.id) { invalidate(); return; }

      // Toda la configuración se hidrata desde una sola lectura confirmada.
      const { data: settings, error: settingsError } = await supabase
        .from("profiles")
        .select("username, display_name, unified_profile, musician_roles, musician_category, accent_color, settings_revision")
        .eq("id", profile.id)
        .eq("user_id", user.id)
        .maybeSingle()
        .setHeader("Authorization", `Bearer ${auth.session.access_token}`);
      if (settingsError || !settings) throw new Error("No se pudo cargar la configuración.");
      if (!Number.isSafeInteger(settings.settings_revision) || settings.settings_revision < 0) throw new Error("Revisión inválida");
      if (!stillCurrent(user.id)) return;
      settingsRevision.current = settings.settings_revision;
      setProfileId(profile.id);
      setOwnerUserId(user.id);
      setUsername(settings.username ?? "");
      setUsernameOriginal(settings.username ?? "");
      setDisplayName(settings.display_name ?? "");
      setUnifiedProfile(Boolean(settings.unified_profile));
      setRoles(parseMusicianRoles(settings.musician_roles ?? settings.musician_category));
      setProfileAccent(isAccentColor(settings.accent_color) ? settings.accent_color : "rojo");
      setSavedSettings(settingsSnapshot(settings.display_name ?? "", settings.username ?? "",
        Boolean(settings.unified_profile), parseMusicianRoles(settings.musician_roles ?? settings.musician_category),
        isAccentColor(settings.accent_color) ? settings.accent_color : "rojo"));
      setRequiereRecarga(false);
      setLoading(false);
    }
    void cargarPerfil().catch(() => {
      if (!active || context.invalidated) return;
      setProfileId(null);
      setErrorMensaje("No se pudo cargar toda la configuración. Recarga los datos antes de guardar.");
      setLoading(false);
    });
    return () => { active = false; context.invalidated = true; listener.subscription.unsubscribe(); };
  }, [router, reload]);

  const toggleRole = (role: MusicianRole) => {
    setRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : MUSICIAN_ROLES.map((r) => r.id).filter((id) => id === role || prev.includes(id))
    );
  };

  const guardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();
    const context = sessionContext.current;
    if (!profileId || !ownerUserId || settingsRevision.current === null || !context || context.invalidated || context.owner !== ownerUserId || guardadoEnCurso.current || requiereRecarga) return;
    const stillCurrent = () => sessionContext.current === context && !context.invalidated && context.owner === ownerUserId;
    guardadoEnCurso.current = true;
    setGuardando(true);
    setGuardado(false);
    setErrorMensaje("");
    let escrituraIniciada = false;
    try {
      // El username es la identidad pública: se valida antes de guardar y se
      // comprueba disponibilidad solo si de verdad cambió.
      const nuevoUsername = username.trim().toLowerCase();
      if (!isValidUsername(nuevoUsername)) {
        setErrorMensaje(
          "El nombre de usuario debe tener entre 3 y 30 caracteres, y solo letras minúsculas, números y guión bajo."
        );
        return;
      }
      if (nuevoUsername !== usernameOriginal) {
        const libre = await isUsernameAvailable(nuevoUsername);
        if (!stillCurrent()) return;
        if (!libre) {
          setErrorMensaje(`El nombre de usuario "${nuevoUsername}" ya está en uso o está reservado.`);
          return;
        }
      }

      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (!stillCurrent()) return;
      if (authError || !auth.session || auth.session.user.id !== ownerUserId) {
        context.invalidated = true;
        setSessionChanged(true);
        return;
      }

      escrituraIniciada = true;
      const { data: saved, error } = await supabase
        .from("profiles")
        .update({
          username: nuevoUsername,
          display_name: displayName.trim(),
          unified_profile: unifiedProfile,
          musician_roles: roles,
          accent_color: profileAccent,
        })
        .eq("id", profileId)
        .eq("user_id", ownerUserId)
        .eq("settings_revision", settingsRevision.current)
        .select("id, settings_revision")
        .maybeSingle()
        .setHeader("Authorization", `Bearer ${auth.session.access_token}`);

      if (!stillCurrent()) return;
      if (!error && !saved) {
        setRequiereRecarga(true);
        setErrorMensaje("La configuración cambió en otra sesión o ya no puedes editarla. Conservamos lo que escribiste: copia tus cambios antes de recargar los datos guardados.");
        return;
      }
      if (error || !saved || !Number.isSafeInteger(saved.settings_revision)) throw new Error("Guardado no confirmado");
      settingsRevision.current = saved.settings_revision;

      setUsernameOriginal(nuevoUsername);
      setUsername(nuevoUsername);
      setDisplayName(displayName.trim());
      setSavedSettings(settingsSnapshot(displayName.trim(), nuevoUsername, unifiedProfile, roles, profileAccent));
      setGuardado(true);
      try {
        const actualizado = await revalidarPerfilPublico(nuevoUsername, usernameOriginal || undefined);
        if (!stillCurrent()) return;
        if (!actualizado) setErrorMensaje("Los cambios se guardaron. La página pública puede tardar en actualizarlos.");
      } catch {
        if (!stillCurrent()) return;
        setErrorMensaje("Los cambios se guardaron. La página pública puede tardar en actualizarlos.");
      }
    } catch {
      if (!stillCurrent()) return;
      setRequiereRecarga(escrituraIniciada);
      setErrorMensaje(escrituraIniciada
        ? "No pudimos confirmar el guardado. Conserva tus cambios y recarga los datos guardados antes de repetir."
        : "No pudimos comprobar tus datos. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      guardadoEnCurso.current = false;
      if (sessionContext.current === context) setGuardando(false);
    }
  };

  if (sessionChanged) {
    return <LayoutAdmin><section className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">La sesión cambió</h1>
      <p role="alert" className="text-sm">Ocultamos la configuración de la cuenta anterior y bloqueamos el guardado. Tus cambios pendientes siguen en esta pestaña hasta que recargues.</p>
      <p className="text-sm text-muted-foreground">Si el guardado ya se había enviado, puede haberse completado en la cuenta original. Revisa sus datos antes de repetirlo.</p>
      <button type="button" onClick={() => {
        if (window.confirm("¿Recargar la configuración de la sesión actual? Se perderán los cambios que no hayas guardado en este formulario.")) window.location.reload();
      }} className="min-h-11 rounded-lg border px-4 text-sm">Recargar configuración</button>
    </section></LayoutAdmin>;
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>Cargando configuración…</span>
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-8">
        <header className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground">Configuración de Perfil</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Personaliza tu identidad, tus roles y cómo se ve la plataforma.
          </p>
        </header>

        {errorMensaje && (
          <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{errorMensaje}</p>
            {(!profileId || requiereRecarga) && <button type="button" onClick={() => {
              if (requiereRecarga && !window.confirm("¿Recargar los datos guardados? Los cambios que solo estén en este formulario serán reemplazados.")) return;
              setLoading(true); setErrorMensaje(""); setGuardado(false); setReload(value => value + 1);
            }} className="mt-3 min-h-11 rounded-lg border border-current px-3 py-2 font-medium">Recargar datos guardados</button>}
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

        <form onSubmit={guardarCambios} onChange={() => setGuardado(false)} aria-busy={guardando} className="space-y-6 rounded-xl border border-border bg-card p-6">
          <fieldset disabled={guardando || !profileId} className="w-full min-w-0 space-y-6">
          <div>
            <label htmlFor="artist-display-name" className="mb-1 block text-xs text-muted-foreground">Nombre de artista</label>
            <input
              type="text"
              id="artist-display-name"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Ej. Nova Reyes"
            />
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Es el nombre que se ve en tu perfil. Puede repetirse con el de otro artista.
            </p>
          </div>

          {/* ── Nombre de usuario: la identidad única de la URL ──────────── */}
          <div>
            <label htmlFor="artist-username" className="mb-1 block text-xs text-muted-foreground">Nombre de usuario</label>
            <div className="flex items-center gap-1 rounded-lg border border-input bg-background pl-2.5 focus-within:ring-2 focus-within:ring-primary/50">
              <span className="shrink-0 text-sm text-muted-foreground" aria-hidden="true">@</span>
              <input
                type="text"
                id="artist-username"
                aria-describedby="username-help"
                minLength={3}
                maxLength={30}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="w-full bg-transparent py-2.5 pr-2.5 text-sm text-foreground focus:outline-none"
                placeholder="nova_reyes"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p id="username-help" className="mt-1 text-xs text-muted-foreground">
              Entre 3 y 30 caracteres: solo minúsculas, números y guión bajo. Es único en Vibe y es
              la dirección de tu página.{" "}
              {usernameOriginal && username.trim().toLowerCase() !== usernameOriginal && (
                <span className="text-amber-500">
                  Al cambiarlo, tu enlace anterior (@{usernameOriginal}) seguirá
                  redirigiendo aquí, así que los QR ya impresos no se rompen.
                </span>
              )}
            </p>
          </div>

          {/* ── Roles: definen qué eres como músico ───────────────────── */}
          <div>
            <p id="musician-roles-label" className="mb-1 block text-xs text-muted-foreground">¿Qué eres como músico?</p>
            <p className="mb-3 text-[11px] text-muted-foreground/80">
              Elige todos los roles que te definen — no solo dentro de tus canciones, sino como
              profesional. Con ellos te encuentran en el feed principal.
            </p>
            <div role="group" aria-labelledby="musician-roles-label" className="grid gap-2 sm:grid-cols-2">
              {MUSICIAN_ROLES.map((role) => {
                const selected = roles.includes(role.id);
                const Icon = ROLE_ICONS[role.id];
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => { setGuardado(false); toggleRole(role.id); }}
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
            <AccentSwatches value={profileAccent} onChange={value => { setGuardado(false); setProfileAccent(value); }} />
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
              aria-label="Unificar perfil"
              aria-checked={unifiedProfile}
              onClick={() => { setGuardado(false); setUnifiedProfile((v) => !v); }}
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {guardado && !hasUnsavedChanges ? (
              <span role="status" aria-live="polite" className="text-sm font-semibold text-foreground">¡Cambios guardados con éxito!</span>
            ) : guardando ? (
              <span role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Guardando cambios…
              </span>
            ) : hasUnsavedChanges ? (
              <span role="status" className="text-sm text-muted-foreground">Tienes cambios sin guardar.</span>
            ) : (
              <div />
            )}
            <button
              type="submit"
              disabled={guardando || !profileId || requiereRecarga}
              className="min-h-11 rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {guardando ? "Guardando…" : "Guardar Perfil"}
            </button>
          </div>
          </fieldset>
        </form>

        <BlockedProfilesSettings />
        <AccountStorageSummary />
        {/* Derechos sobre los datos personales: exportación y borrado.
            Ley 29733 y GDPR — no existía ningún mecanismo, y Vibe almacena
            DNIs para la Licencia Express. */}
        <div className="mt-6">
          {ownerUserId && <ZonaDatosPersonales key={ownerUserId} ownerUserId={ownerUserId} displayName={displayName} />}
        </div>
      </div>
    </LayoutAdmin>
  );
}

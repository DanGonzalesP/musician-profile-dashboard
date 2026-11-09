"use client";

// Gestión completa de servicios: todo lo que un músico puede ofrecer, sea
// cual sea su rubro — clases, producción, mezcla/máster, composición,
// sesiones de grabación, shows en vivo, alquiler de equipo... Cada servicio
// tiene categoría, modalidad (presencial/online), duración, tiempo de
// entrega, lista de qué incluye, precio con unidad (por hora/proyecto/...),
// enlace de reserva y flags de activo/destacado. Escribe directo en la
// tabla `services` (esquema vigente en supabase/migrations/0000_baseline.sql).

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { uploadImageNow } from "@/lib/upload";
import { uploadFailureMessage, uploadRequiresNewFile } from "@/lib/upload-feedback";
import { revalidarPerfilPublico } from "@/app/acciones/revalidar-perfil";
import { safeUrlOrNull } from "@/lib/safe-url";
import { useUnsavedForm } from "@/hooks/use-unsaved-form";
import { createServiceCreationAttempt, ServiceCreationRejectedError } from "@/lib/service-creation";
import {
  CURRENCIES,
  PRICE_UNITS,
  DURATION_UNITS,
  SERVICE_CATEGORIES,
  serviceCategoryLabel,
  priceUnitLabel,
  serviceDurationLabel,
  serviceHasDelivery,
  formatMoney,
  type CatalogService,
  fetchCatalog,
  requireCatalogRevision,
  newService,
} from "@/lib/catalog";
import {
  Briefcase,
  Check,
  Clock,
  Globe,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25";

function fullUpdatePayload(s: CatalogService) {
  return {
    title: s.title,
    price: Number(s.price),
    currency: s.currency || "USD",
    description: s.description || null,
    category: s.category,
    price_unit: s.priceUnit,
    modality: s.modality,
    duration: s.duration || null,
    duration_unit: s.durationUnit || null,
    delivery_time: s.deliveryTime || null,
    features: s.features,
    booking_url: safeUrlOrNull(s.bookingUrl),
    image_url: s.imageUrl || null,
    is_active: s.isActive,
    is_featured: s.isFeatured,
  };
}

const MODALITIES = [
  { id: "presencial", label: "Presencial" },
  { id: "online", label: "Online" },
  { id: "ambas", label: "Ambas" },
] as const;

export default function AdminServiciosPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [requiresReload, setRequiresReload] = useState(false);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [statusMensaje, setStatusMensaje] = useState("");
  const [creationPending, setCreationPending] = useState(false);
  const [creationRejected, setCreationRejected] = useState(false);
  const creationAttempt = useRef<{
    requestId: string;
    owner: string;
    profileId: string;
    run: ReturnType<typeof createServiceCreationAttempt>;
  } | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [sessionChanged, setSessionChanged] = useState(false);
  const accountContext = useRef<{ owner: string | null | undefined; active: boolean; invalidated: boolean } | null>(null);
  const router = useRouter();

  async function captureAccount() {
    const context = accountContext.current;
    const isCurrent = () => accountContext.current === context && Boolean(context?.active) && !context?.invalidated;
    if (!context || !isCurrent()) throw new Error("Sesión no disponible");
    const { data, error } = await supabase.auth.getSession();
    if (!isCurrent()) throw new Error("Sesión cambiada");
    if (error) throw new Error("Sesión no disponible");
    if (!data.session) {
      context.invalidated = true;
      setSessionChanged(true);
      throw new Error("Sesión no disponible");
    }
    const owner = data.session.user.id;
    if (context.owner !== undefined && context.owner !== owner) {
      context.invalidated = true;
      setSessionChanged(true);
      throw new Error("Sesión cambiada");
    }
    context.owner = owner;
    return { token: data.session.access_token, owner, isCurrent };
  }

  const cargarServicios = async (id: string, mostrarCarga = true) => {
    const context = accountContext.current;
    const stillCurrent = () => accountContext.current === context && context?.active && !context.invalidated;
    if (!stillCurrent()) return false;
    if (mostrarCarga) setLoading(true);
    setErrorMensaje("");
    try {
      const account = await captureAccount();
      if (!account.isCurrent() || !stillCurrent()) return false;
      const { services: rows } = await fetchCatalog(id, account.token);
      if (!account.isCurrent()) return false;
      setServices(rows);
      setLoadFailed(false);
      if (creationAttempt.current) {
        setErrorMensaje("La lista se actualizó. Usa Confirmar creación pendiente para recuperar la respuesta de la misma solicitud, sin crear otro servicio.");
      } else {
        setRequiresReload(false);
      }
      return true;
    } catch {
      if (!stillCurrent()) return false;
      setErrorMensaje("No se pudieron cargar los servicios. Inténtalo de nuevo.");
      setLoadFailed(true);
      return false;
    } finally {
      if (mostrarCarga && stillCurrent()) setLoading(false);
    }
  };

  // La carga inicial usa el estado más reciente del formulario sin volver a
  // ejecutar el efecto de sesión cada vez que cambia ese estado.
  const cargarAlIniciar = useEffectEvent((id: string) => cargarServicios(id));

  useEffect(() => {
    const context = { owner: undefined as string | null | undefined, active: true, invalidated: false };
    accountContext.current = context;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!context.active) return;
      const next = session?.user.id ?? null;
      if (context.owner !== undefined && context.owner !== next) {
        context.invalidated = true;
        setSessionChanged(true);
        setStatusMensaje("");
      }
      context.owner = next;
    });
    async function verificarSesion() {
      let user: { id: string } | null = null;
      setLoading(true);
      setLoadFailed(false);
      setErrorMensaje("");
      try {
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (!context.active || context.invalidated) return;
        user = currentUser;
        if (authError) {
          setErrorMensaje("No se pudo verificar tu sesión. Inténtalo de nuevo.");
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        if (!user) {
          router.push("/login");
          return;
        }
        const account = await captureAccount();
        if (!account.isCurrent()) return;
        if (account.owner !== user.id) {
          context.invalidated = true;
          setSessionChanged(true);
          return;
        }
        setOwnerUserId(account.owner);
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, username")
          .eq("user_id", user.id)
          .maybeSingle().setHeader("Authorization", `Bearer ${account.token}`);
        if (!account.isCurrent()) return;
        if (profileError) {
          setErrorMensaje("No se pudo cargar tu perfil. Inténtalo de nuevo.");
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        // Sin fila de perfil no se sigue: antes se caía al perfil semilla
        // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
        if (!profile) {
          setErrorMensaje("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        const id = profile.id;
        setProfileId(id);
        setProfileUsername(profile.username);
        await cargarAlIniciar(id);
      } catch {
        if (!context.active || context.invalidated) return;
        setErrorMensaje("No se pudo verificar tu sesión. Inténtalo de nuevo.");
        setLoadFailed(true);
        setLoading(false);
      }
    }
    verificarSesion();
    return () => { context.active = false; listener.subscription.unsubscribe(); };
  }, [router, retryAttempt]);

  const guardar = async () => {
    if (actionLock.current || requiresReload || creationAttempt.current || !editing || !profileId || !editing.title.trim() || uploading) return;
    const priceText = editing.price.trim();
    const price = Number(priceText);
    if (!priceText || !Number.isFinite(price) || price < 0) {
      setErrorMensaje("Ingresa un precio válido igual o mayor que cero.");
      return;
    }
    const bookingUrl = editing.bookingUrl.trim();
    if (bookingUrl && !safeUrlOrNull(bookingUrl)) {
      setErrorMensaje("Ingresa un enlace de reserva válido.");
      return;
    }
    await ejecutarCambio(async (token, isCurrent, owner) => {
      const payload = { ...fullUpdatePayload(editing), title: editing.title.trim(), booking_url: safeUrlOrNull(bookingUrl) };
      if (isNew) {
        const attempt = {
          requestId: editing.id, owner, profileId,
          run: createServiceCreationAttempt(profileId, editing.id, { ...payload, position_index: services.length }, owner),
        };
        creationAttempt.current = attempt;
        setCreationRejected(false);
        setCreationPending(true);
        await attempt.run(isCurrent);
        return;
      }
      const result = await supabase.from("services").update(payload).eq("id", editing.id).eq("profile_id", profileId).eq("revision", requireCatalogRevision(editing)).select("id").setHeader("Authorization", `Bearer ${token}`);
      if (result.error || !result.data?.length) throw new Error("Guardado no confirmado");
    }, "Servicio guardado.", true);
  };

  const confirmarCreacion = async () => {
    if (creationRejected) return;
    const attempt = creationAttempt.current;
    if (!attempt || !editing || attempt.requestId !== editing.id || attempt.profileId !== profileId || attempt.owner !== ownerUserId) return;
    await ejecutarCambio(async (_token, isCurrent, owner) => {
      if (owner !== attempt.owner || creationAttempt.current !== attempt) throw new Error("Solicitud no disponible");
      await attempt.run(isCurrent);
    }, "Creación del servicio confirmada.", true, true);
  };

  async function ejecutarCambio(action: (token: string, isCurrent: () => boolean, owner: string) => Promise<void>, success: string, closeEditor = false, recoveringCreation = false) {
    if (!profileId || actionLock.current || (requiresReload && !recoveringCreation)) return;
    const context = accountContext.current;
    const stillCurrent = () => accountContext.current === context && context?.active && !context.invalidated;
    if (!stillCurrent()) return;
    actionLock.current = true;
    setBusy(true);
    setSaving(closeEditor);
    setErrorMensaje("");
    setStatusMensaje("");
    try {
      const account = await captureAccount();
      if (!account.isCurrent() || !stillCurrent()) return;
      await action(account.token, account.isCurrent, account.owner);
      if (!account.isCurrent()) return;
      let cacheWarning = false;
      if (profileUsername) {
        try { cacheWarning = !await revalidarPerfilPublico(profileUsername); } catch { cacheWarning = true; }
      }
      if (!account.isCurrent()) return;
      if (closeEditor) {
        creationAttempt.current = null;
        setCreationPending(false);
        setCreationRejected(false);
        setRequiresReload(false);
        setEditing(null);
      }
      await cargarServicios(profileId, false);
      if (!account.isCurrent()) return;
      setStatusMensaje(`${success}${cacheWarning ? " La vista pública puede tardar en actualizarse; no repitas el guardado." : ""}`);
    } catch (error) {
      if (!stillCurrent()) return;
      setRequiresReload(true);
      if (creationAttempt.current && error instanceof ServiceCreationRejectedError) {
        setCreationRejected(error.reason !== "unavailable");
        setErrorMensaje(error.message);
        return;
      }
      setErrorMensaje(creationAttempt.current
        ? "No pudimos confirmar la creación. Conservamos la solicitud original; puedes recuperar su resultado sin duplicarla."
        : "No pudimos confirmar el cambio. Conservamos tus datos; recarga la lista. Si el servicio cambió desde otra pestaña, copia tus cambios pendientes, cierra este formulario y abre la versión actual antes de guardar.");
    } finally {
      actionLock.current = false;
      if (stillCurrent()) {
        setSaving(false);
        setBusy(false);
      }
    }
  }

  const eliminar = async (id: string) => {
    if (!profileId || actionLock.current || requiresReload || !window.confirm("¿Eliminar este servicio? Esta acción no se puede deshacer.")) return;
    await ejecutarCambio(async (token) => {
      const service = services.find((item) => item.id === id);
      if (!service) throw new Error("Servicio no disponible");
      const { data, error } = await supabase.from("services").delete().eq("id", id)
        .eq("profile_id", profileId).eq("revision", requireCatalogRevision(service)).select("id").setHeader("Authorization", `Bearer ${token}`);
      if (error || !data?.length) throw new Error("Eliminación no confirmada");
    }, "Servicio eliminado.");
  };

  const toggleFlag = async (service: CatalogService, flag: "is_active" | "is_featured") => {
    const value = flag === "is_active" ? !service.isActive : !service.isFeatured;
    await ejecutarCambio(async (token) => {
      const { data, error } = await supabase.from("services").update({ [flag]: value })
        .eq("id", service.id).eq("profile_id", profileId).eq("revision", requireCatalogRevision(service)).select("id").setHeader("Authorization", `Bearer ${token}`);
      if (error || !data?.length) throw new Error("Cambio no confirmado");
    }, "Servicio actualizado.");
  };

  if (sessionChanged) {
    return <LayoutAdmin><div role="alert" className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">La cuenta cambió</h1>
      <p>Detuvimos este formulario. Un cambio enviado antes del cambio de sesión puede haberse guardado; revisa la lista al volver a entrar.</p>
      <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => { if (!editing || window.confirm("Recargar descartará el formulario sin guardar. ¿Continuar?")) window.location.reload(); }}>Volver a cargar con la cuenta actual</button>
    </div></LayoutAdmin>;
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <span>Cargando servicios…</span>
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
              <Briefcase className="size-6 text-primary" /> Servicios
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Ofrece lo que sabes hacer: clases, producción, mezcla, composición, sesiones, shows,
              alquiler... Configura precios, modalidad y qué incluye cada servicio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { if (busy || uploading || requiresReload || !profileId || loadFailed || editing) return; setEditing({ ...newService(), title: "", price: "" }); setIsNew(true); }}
            disabled={busy || uploading || requiresReload || !profileId || loadFailed || editing !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Nuevo servicio
          </button>
        </header>

        {errorMensaje && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMensaje}
            {loadFailed && (
              <button type="button" disabled={busy || uploading} onClick={() => profileId ? cargarServicios(profileId, !editing) : setRetryAttempt((attempt) => attempt + 1)} className="ml-2 min-h-11 underline disabled:opacity-50">Reintentar</button>
            )}
            {requiresReload && profileId && (
              <button type="button" disabled={busy || uploading} onClick={() => cargarServicios(profileId, false)} className="ml-2 min-h-11 underline disabled:opacity-50">Recargar lista sin descartar el formulario</button>
            )}
          </div>
        )}
        {statusMensaje && <p role="status" className="text-sm text-primary">{statusMensaje}</p>}
        {creationPending && (
          <div role="status" className="space-y-2 rounded-xl border border-border bg-card/60 p-4 text-sm">
            <p>{creationRejected
              ? "Esta solicitud no admite otro intento de confirmación. Puedes consultar los datos del formulario antes de cerrarlo; revisa la lista antes de crear otro servicio."
              : "Conservamos los datos enviados sin modificarlos hasta confirmar la creación. Si cierras o recargas esta página, perderás este intento: revisa la lista antes de crear otro servicio."}</p>
            {!creationRejected && <button type="button" disabled={busy || uploading} onClick={() => void confirmarCreacion()} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">{busy ? "Confirmando creación…" : "Confirmar creación pendiente"}</button>}
          </div>
        )}
        {editing && ownerUserId && (
          <ServiceForm
            key={editing.id}
            service={editing}
            ownerUserId={ownerUserId}
            isAccountCurrent={() => Boolean(accountContext.current?.active && !accountContext.current.invalidated && accountContext.current.owner === ownerUserId)}
            isNew={isNew}
            saving={saving}
            uploading={uploading}
            requiresReload={requiresReload || creationPending}
            onUploadingChange={setUploading}
            onChange={setEditing}
            onCancel={() => {
              if (busy || uploading) return;
              if (creationAttempt.current) {
                creationAttempt.current = null;
                setCreationPending(false);
                setCreationRejected(false);
                setRequiresReload(false);
                setErrorMensaje("");
                setStatusMensaje("Formulario cerrado. La solicitud enviada puede haberse guardado; revisa la lista antes de crear otro servicio.");
              }
              setEditing(null);
            }}
            onSave={guardar}
          />
        )}

        {services.length === 0 && !editing && !loadFailed ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Briefcase className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium text-foreground">Aún no ofreces servicios</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crea el primero — desde clases hasta shows en vivo.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <div
                key={s.id}
                className={`gradient-border gradient-border-static relative flex flex-col gap-3 rounded-2xl bg-card/60 p-5 ${
                  s.isActive ? "" : "opacity-55"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                      {serviceCategoryLabel(s.category)}
                    </span>
                    <p className="mt-2 line-clamp-1 text-sm font-semibold text-foreground">{s.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFlag(s, "is_featured")}
                    disabled={busy || uploading || requiresReload || editing !== null}
                    aria-label={s.isFeatured ? `Quitar ${s.title} de destacados` : `Destacar ${s.title}`}
                    title={s.isFeatured ? "Quitar de destacados" : "Destacar"}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                      s.isFeatured ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Star className={`size-3.5 ${s.isFeatured ? "fill-current" : ""}`} />
                  </button>
                </div>

                {s.description && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {s.modality === "online" ? <Globe className="size-3" /> : <MapPin className="size-3" />}
                    {MODALITIES.find((m) => m.id === s.modality)?.label}
                  </span>
                  {serviceDurationLabel(s) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {serviceDurationLabel(s)}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <p className="text-base font-bold tabular-nums text-primary">
                    {formatMoney(Number(s.price || 0), s.currency)}{" "}
                    <span className="text-[11px] font-medium text-muted-foreground">{priceUnitLabel(s.priceUnit)}</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={s.isActive}
                      aria-label={`Visibilidad de ${s.title}`}
                      onClick={() => toggleFlag(s, "is_active")}
                      disabled={busy || uploading || requiresReload || editing !== null}
                      title={s.isActive ? "Visible" : "Oculto"}
                      className={`relative h-5 w-9 rounded-full transition-colors ${s.isActive ? "bg-primary" : "bg-secondary"}`}
                    >
                      <span
                        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                          s.isActive ? "translate-x-[18px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing({ ...s }); setIsNew(false); }}
                      disabled={busy || uploading || requiresReload || editing !== null}
                      aria-label={`Editar ${s.title}`}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(s.id)}
                      disabled={busy || uploading || requiresReload || editing !== null}
                      aria-label={`Eliminar ${s.title}`}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutAdmin>
  );
}

// ─── Formulario de servicio ────────────────────────────────────────────────

function ServiceForm({
  service,
  ownerUserId,
  isAccountCurrent,
  isNew,
  saving,
  uploading,
  requiresReload,
  onUploadingChange,
  onChange,
  onCancel,
  onSave,
}: {
  service: CatalogService;
  ownerUserId: string;
  isAccountCurrent: () => boolean;
  isNew: boolean;
  saving: boolean;
  uploading: boolean;
  requiresReload: boolean;
  onUploadingChange: (value: boolean) => void;
  onChange: (s: CatalogService) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [featureDraft, setFeatureDraft] = useState("");
  const uploadLock = useRef(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [mustReselectImage, setMustReselectImage] = useState(false);
  const hasFeatureDraft = Boolean(featureDraft.trim());
  const { dirty, canDiscard } = useUnsavedForm(service, pendingImage !== null || hasFeatureDraft, saving || uploading);
  const cancelEditing = () => { if (!uploadLock.current && canDiscard()) onCancel(); };

  const subirImagen = async (file: File) => {
    if (!active.current || !isAccountCurrent() || uploadLock.current || saving || uploading || requiresReload) return;
    uploadLock.current = true;
    setPendingImage(file);
    setUploadError("");
    setMustReselectImage(false);
    onUploadingChange(true);
    try {
      const url = await uploadImageNow(file, ownerUserId);
      if (!active.current || !isAccountCurrent()) return;
      onChange({ ...service, imageUrl: url });
      setPendingImage(null);
    } catch (error) {
      if (!active.current || !isAccountCurrent()) return;
      setMustReselectImage(uploadRequiresNewFile(error));
      setUploadError(uploadFailureMessage(error, "No pudimos confirmar la subida. Tu imagen anterior y los datos del servicio se conservan. Puedes reintentar mientras este formulario siga abierto."));
    } finally {
      uploadLock.current = false;
      if (active.current && isAccountCurrent()) {
        onUploadingChange(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  };

  const agregarFeature = () => {
    const value = featureDraft.trim();
    if (!value) return;
    onChange({ ...service, features: [...service.features, value] });
    setFeatureDraft("");
  };

  return (
    <div aria-busy={saving || uploading} className="gradient-border relative space-y-5 rounded-2xl bg-card/60 p-5 backdrop-blur sm:p-6">
      {uploadError && <div role="alert" className="text-sm text-destructive">
        <p>{uploadError}</p>
        <p>{mustReselectImage ? "Selecciona de nuevo o descarta la imagen pendiente antes de guardar." : "Reintenta o descarta la imagen pendiente antes de guardar."}</p>
        {pendingImage && <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" disabled={saving || uploading || requiresReload} onClick={() => mustReselectImage ? fileRef.current?.click() : void subirImagen(pendingImage)} className="min-h-11 rounded-lg border border-current px-3 disabled:opacity-50">{mustReselectImage ? "Seleccionar imagen de nuevo" : "Reintentar imagen"}</button>
          <button type="button" disabled={saving || uploading} onClick={() => { setPendingImage(null); setUploadError(""); }} className="min-h-11 px-3 underline disabled:opacity-50">Descartar imagen pendiente</button>
        </div>}
      </div>}
      <p role="status" className="text-sm">{uploading ? "Subiendo imagen…" : ""}</p>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          {isNew ? "Nuevo servicio" : `Editar: ${service.title || "servicio"}`}
        </h2>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={saving || uploading}
          aria-label="Cerrar formulario"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <fieldset disabled={saving || uploading || requiresReload} className="contents">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="service-title" className="text-xs font-medium text-muted-foreground">Nombre del servicio *</label>
          <input
            id="service-title"
            type="text"
            value={service.title}
            onChange={(e) => onChange({ ...service, title: e.target.value })}
            className={inputClass}
            placeholder="Ej. Clases de guitarra / Mezcla profesional / Show acústico"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="service-category" className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select
            id="service-category"
            value={service.category}
            onChange={(e) => onChange({ ...service, category: e.target.value })}
            className={inputClass}
          >
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="service-description" className="text-xs font-medium text-muted-foreground">Descripción</label>
        <textarea
          id="service-description"
          value={service.description}
          onChange={(e) => onChange({ ...service, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Qué ofreces exactamente, para quién es, cómo se trabaja..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="service-price" className="text-xs font-medium text-muted-foreground">Precio *</label>
          <div className="flex gap-2">
            <input
              id="service-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={service.price}
              onChange={(e) => onChange({ ...service, price: e.target.value })}
              className={`${inputClass} flex-1`}
              placeholder="150.00"
            />
            <select
              value={service.currency}
              onChange={(e) => onChange({ ...service, currency: e.target.value })}
              className={`${inputClass} w-24 shrink-0`}
              aria-label="Moneda"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="service-price-unit" className="text-xs font-medium text-muted-foreground">Cobras...</label>
          <select
            id="service-price-unit"
            value={service.priceUnit}
            onChange={(e) => onChange({ ...service, priceUnit: e.target.value })}
            className={inputClass}
          >
            {PRICE_UNITS.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Modalidad</label>
          <div className="flex gap-1 rounded-lg border border-input bg-background p-0.5">
            {MODALITIES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...service, modality: m.id })}
                className={`flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                  service.modality === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="service-duration" className="text-xs font-medium text-muted-foreground">Duración (opcional)</label>
          <div className="flex gap-2">
            <input
              id="service-duration"
              type="number"
              inputMode="numeric"
              min="0"
              value={service.duration}
              onChange={(e) => onChange({ ...service, duration: e.target.value })}
              className={`${inputClass} flex-1`}
              placeholder="60"
            />
            <select
              id="service-duration-unit"
              value={service.durationUnit}
              onChange={(e) => onChange({ ...service, durationUnit: e.target.value })}
              className={`${inputClass} w-32 shrink-0`}
              aria-label="Unidad de duración"
            >
              {DURATION_UNITS.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {serviceHasDelivery(service.category) && (
        <div className="space-y-1.5">
          <label htmlFor="service-delivery-time" className="text-xs font-medium text-muted-foreground">Tiempo de entrega (opcional)</label>
          <input
            id="service-delivery-time"
            type="text"
            value={service.deliveryTime}
            onChange={(e) => onChange({ ...service, deliveryTime: e.target.value })}
            className={inputClass}
            placeholder="Ej. 5 días hábiles"
          />
        </div>
      )}

      {/* Qué incluye */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Qué incluye</label>
        {service.features.length > 0 && (
          <ul className="space-y-1">
            {service.features.map((f, i) => (
              <li key={`${f}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> {f}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ ...service, features: service.features.filter((_, idx) => idx !== i) })}
                  aria-label={`Quitar ${f}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasFeatureDraft && (
          <div role="status" className="text-sm text-muted-foreground">
            Añade el detalle que estás escribiendo o descártalo antes de guardar.
            <button type="button" onClick={() => setFeatureDraft("")} className="ml-2 min-h-11 underline">Descartar detalle pendiente</button>
          </div>
        )}
        {dirty && <p className="text-xs text-muted-foreground">Cambios sin guardar. Se conservan mientras este formulario siga abierto.</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={featureDraft}
            aria-label="Nuevo elemento incluido"
            onChange={(e) => setFeatureDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarFeature(); } }}
            className={inputClass}
            placeholder="Ej. Archivo WAV master + versión para redes"
          />
          <button
            type="button"
            onClick={agregarFeature}
            aria-label="Agregar elemento incluido"
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="service-booking-url" className="text-xs font-medium text-muted-foreground">
            Enlace de reserva o cotización (opcional)
          </label>
          <input
            id="service-booking-url"
            type="url"
            value={service.bookingUrl}
            onChange={(e) => onChange({ ...service, bookingUrl: e.target.value })}
            className={inputClass}
            placeholder="https://calendly.com/... o tu WhatsApp wa.me/..."
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Imagen (opcional)</label>
          <div className="flex items-center gap-2">
            {service.imageUrl ? (
              <div className="group relative size-14 overflow-hidden rounded-lg border border-border">
                <img src={service.imageUrl} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => onChange({ ...service, imageUrl: "" })}
                  aria-label="Quitar imagen del servicio"
                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label={uploading ? "Subiendo imagen" : "Subir imagen del servicio"}
                className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirImagen(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={service.isActive}
              onChange={(e) => onChange({ ...service, isActive: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Visible
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={service.isFeatured}
              onChange={(e) => onChange({ ...service, isFeatured: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Destacado
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cancelEditing}
            disabled={saving || uploading}
            aria-label="Cancelar cambios del servicio"
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { if (!pendingImage && !hasFeatureDraft && !uploadLock.current && !saving && !requiresReload) onSave(); }}
            disabled={saving || uploading || requiresReload || pendingImage !== null || hasFeatureDraft || !service.title.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isNew ? "Crear servicio" : "Guardar cambios"}
          </button>
        </div>
      </div>
      </fieldset>
    </div>
  );
}

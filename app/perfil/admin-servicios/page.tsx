"use client";

// Gestión completa de servicios: todo lo que un músico puede ofrecer, sea
// cual sea su rubro — clases, producción, mezcla/máster, composición,
// sesiones de grabación, shows en vivo, alquiler de equipo... Cada servicio
// tiene categoría, modalidad (presencial/online), duración, tiempo de
// entrega, lista de qué incluye, precio con unidad (por hora/proyecto/...),
// enlace de reserva y flags de activo/destacado. Escribe directo en la
// tabla `services` (columnas nuevas en supabase/setup_vibra.sql).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import LayoutAdmin from "@/components/LayoutAdmin";
import { uploadImageNow } from "@/lib/upload";
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
    price: Number(s.price) || 0,
    currency: s.currency || "USD",
    description: s.description || null,
    category: s.category,
    price_unit: s.priceUnit,
    modality: s.modality,
    duration: s.duration || null,
    duration_unit: s.durationUnit || null,
    delivery_time: s.deliveryTime || null,
    features: s.features,
    booking_url: s.bookingUrl || null,
    image_url: s.imageUrl || null,
    is_active: s.isActive,
    is_featured: s.isFeatured,
  };
}

function legacyUpdatePayload(s: CatalogService) {
  return {
    title: s.title,
    price: Number(s.price) || 0,
    description: s.description || null,
  };
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? "");
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
  const [errorMensaje, setErrorMensaje] = useState("");
  const [avisoMigracion, setAvisoMigracion] = useState(false);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const cargarServicios = async (id: string) => {
    try {
      const { services: rows } = await fetchCatalog(id);
      setServices(rows);
    } catch (err) {
      setErrorMensaje(err instanceof Error ? err.message : "No se pudieron cargar los servicios.");
    }
    setLoading(false);
  };

  useEffect(() => {
    async function verificarSesion() {
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
      cargarServicios(id);
    }
    verificarSesion();
  }, [router]);

  const guardar = async () => {
    if (!editing || !profileId || !editing.title.trim()) return;
    setSaving(true);
    setErrorMensaje("");
    try {
      if (isNew) {
        const { error } = await supabase.from("services").insert([
          { profile_id: profileId, position_index: services.length, ...fullUpdatePayload(editing) },
        ]);
        if (error) {
          if (!isMissingColumn(error)) throw error;
          setAvisoMigracion(true);
          const { error: legacyError } = await supabase.from("services").insert([
            { profile_id: profileId, position_index: services.length, ...legacyUpdatePayload(editing) },
          ]);
          if (legacyError) throw legacyError;
        }
      } else {
        const { error } = await supabase.from("services").update(fullUpdatePayload(editing)).eq("id", editing.id);
        if (error) {
          if (!isMissingColumn(error)) throw error;
          setAvisoMigracion(true);
          const { error: legacyError } = await supabase
            .from("services")
            .update(legacyUpdatePayload(editing))
            .eq("id", editing.id);
          if (legacyError) throw legacyError;
        }
      }
      setEditing(null);
      cargarServicios(profileId);
    } catch (err) {
      setErrorMensaje(err instanceof Error ? err.message : "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id: string) => {
    if (!profileId) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) setErrorMensaje(error.message);
    else cargarServicios(profileId);
  };

  const toggleFlag = async (s: CatalogService, flag: "is_active" | "is_featured") => {
    if (!profileId) return;
    const value = flag === "is_active" ? !s.isActive : !s.isFeatured;
    const { error } = await supabase.from("services").update({ [flag]: value }).eq("id", s.id);
    if (error) {
      if (isMissingColumn(error)) setAvisoMigracion(true);
      else setErrorMensaje(error.message);
      return;
    }
    cargarServicios(profileId);
  };

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
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
            onClick={() => { setEditing({ ...newService(), title: "", price: "" }); setIsNew(true); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Nuevo servicio
          </button>
        </header>

        {errorMensaje && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMensaje}
          </div>
        )}
        {avisoMigracion && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-500">
            Se guardó lo básico, pero los campos avanzados (categoría, modalidad, qué incluye...)
            necesitan que corras <code className="font-mono">supabase/setup_vibra.sql</code> una vez en el SQL Editor de Supabase.
          </div>
        )}

        {editing && (
          <ServiceForm
            service={editing}
            isNew={isNew}
            saving={saving}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={guardar}
          />
        )}

        {services.length === 0 && !editing ? (
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
                      onClick={() => toggleFlag(s, "is_active")}
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
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(s.id)}
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
  isNew,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  service: CatalogService;
  isNew: boolean;
  saving: boolean;
  onChange: (s: CatalogService) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [featureDraft, setFeatureDraft] = useState("");

  const subirImagen = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageNow(file);
      onChange({ ...service, imageUrl: url });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const agregarFeature = () => {
    const value = featureDraft.trim();
    if (!value) return;
    onChange({ ...service, features: [...service.features, value] });
    setFeatureDraft("");
  };

  return (
    <div className="gradient-border relative space-y-5 rounded-2xl bg-card/60 p-5 backdrop-blur sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          {isNew ? "Nuevo servicio" : `Editar: ${service.title || "servicio"}`}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nombre del servicio *</label>
          <input
            type="text"
            value={service.title}
            onChange={(e) => onChange({ ...service, title: e.target.value })}
            className={inputClass}
            placeholder="Ej. Clases de guitarra / Mezcla profesional / Show acústico"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select
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
        <label className="text-xs font-medium text-muted-foreground">Descripción</label>
        <textarea
          value={service.description}
          onChange={(e) => onChange({ ...service, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Qué ofreces exactamente, para quién es, cómo se trabaja..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Precio *</label>
          <div className="flex gap-2">
            <input
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
          <label className="text-xs font-medium text-muted-foreground">Cobras...</label>
          <select
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
          <label className="text-xs font-medium text-muted-foreground">Duración (opcional)</label>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={service.duration}
              onChange={(e) => onChange({ ...service, duration: e.target.value })}
              className={`${inputClass} flex-1`}
              placeholder="60"
            />
            <select
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
          <label className="text-xs font-medium text-muted-foreground">Tiempo de entrega (opcional)</label>
          <input
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
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={featureDraft}
            onChange={(e) => setFeatureDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarFeature(); } }}
            className={inputClass}
            placeholder="Ej. Archivo WAV master + versión para redes"
          />
          <button
            type="button"
            onClick={agregarFeature}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Enlace de reserva o cotización (opcional)
          </label>
          <input
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
                  className="absolute inset-0 hidden items-center justify-center bg-black/60 text-white group-hover:flex"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
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
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !service.title.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isNew ? "Crear servicio" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

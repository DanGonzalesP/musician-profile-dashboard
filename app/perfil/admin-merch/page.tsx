"use client";

// Gestión completa de la tienda de merch: un músico puede vender CUALQUIER
// producto de su rubro — ropa, vinilos, instrumentos, arte, digitales,
// entradas... Cada producto tiene categoría, tipo (físico/digital), fotos,
// variantes (tallas/colores/formatos), precio con moneda, stock, enlace de
// compra externo, y flags de activo/destacado. Todo escribe directo en la
// tabla `products` (el esquema vigente viene del baseline versionado;
// si la migración no corrió, se guarda lo básico y se avisa).

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { revalidarPerfilPublico } from "@/app/acciones/revalidar-perfil";
import { uploadImageNow } from "@/lib/upload";
import { uploadFailureMessage, uploadRequiresNewFile } from "@/lib/upload-feedback";
import { safeUrlOrNull } from "@/lib/safe-url";
import { useUnsavedForm } from "@/hooks/use-unsaved-form";
import {
  CURRENCIES,
  PRODUCT_CATEGORIES,
  productCategoryLabel,
  type CatalogProduct,
  type ProductVariantGroup,
  fetchCatalog,
  requireCatalogRevision,
  newProduct,
} from "@/lib/catalog";
import {
  Download,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25";

function fullUpdatePayload(p: CatalogProduct) {
  return {
    title: p.name,
    price: Number(p.price) || 0,
    images_urls: p.images,
    stock_quantity: p.stock,
    description: p.description || null,
    category: p.category,
    product_kind: p.kind,
    currency: p.currency,
    variants: p.variants,
    purchase_url: p.purchaseUrl || null,
    is_active: p.isActive,
    is_featured: p.isFeatured,
  };
}

export default function AdminMerchPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileUsername, setProfileUsername] = useState("");
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const [retry, setRetry] = useState(0);
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

  const cargarProductos = async (id: string) => {
    const context = accountContext.current;
    const stillCurrent = () => accountContext.current === context && context?.active && !context.invalidated;
    try {
      const account = await captureAccount();
      if (!account.isCurrent() || !stillCurrent()) return;
      const { products: rows } = await fetchCatalog(id, account.token);
      if (!account.isCurrent()) return;
      setProducts(rows);
      if (requiresReload && editing && isNew && rows.some(row => row.id === editing.id)) {
        setIsNew(false);
        setStatusMessage("El producto ya aparece guardado. Conservamos el formulario para que puedas revisar tus cambios.");
      }
      setErrorMensaje("");
      setLoadFailed(false);
      setRequiresReload(false);
    } catch {
      if (!stillCurrent()) return;
      setLoadFailed(true);
      setErrorMensaje("No pudimos cargar los productos. Inténtalo de nuevo.");
    }
    if (stillCurrent()) setLoading(false);
  };

  // La carga inicial usa el estado más reciente del formulario sin volver a
  // ejecutar el efecto de sesión cada vez que cambia ese estado.
  const cargarAlIniciar = useEffectEvent((id: string) => cargarProductos(id));

  useEffect(() => {
    const context = { owner: undefined as string | null | undefined, active: true, invalidated: false };
    accountContext.current = context;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!context.active) return;
      const next = session?.user.id ?? null;
      if (context.owner !== undefined && context.owner !== next) {
        context.invalidated = true;
        setSessionChanged(true);
        setStatusMessage("");
      }
      context.owner = next;
    });
    async function verificarSesion() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!context.active || context.invalidated) return;
      if (authError || !user) {
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
        setLoadFailed(true);
        setErrorMensaje("No pudimos cargar tu perfil. Inténtalo de nuevo.");
        setLoading(false);
        return;
      }
      // Sin fila de perfil no se sigue: antes se caía al perfil semilla
      // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
      if (!profile) {
        setLoadFailed(true);
        setErrorMensaje("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
        setLoading(false);
        return;
      }
      const id = profile.id;
      setProfileId(id);
      setProfileUsername(profile.username ?? "");
      await cargarAlIniciar(id);
    }
    void verificarSesion().catch(() => {
      if (!context.active || context.invalidated) return;
      setLoadFailed(true);
      setErrorMensaje("No pudimos cargar la tienda. Revisa tu conexión e inténtalo de nuevo.");
      setLoading(false);
    });
    return () => { context.active = false; listener.subscription.unsubscribe(); };
  }, [router, retry]);

  const abrirNuevo = () => {
    setEditing({ ...newProduct(), name: "", price: "" });
    setIsNew(true);
  };

  const abrirEdicion = (p: CatalogProduct) => {
    setEditing({ ...p });
    setIsNew(false);
  };

  async function ejecutarCambio(action: (token: string, isCurrent: () => boolean) => Promise<void>, success: string) {
    if (actionLock.current || !profileId || requiresReload) return;
    actionLock.current = true;
    setSaving(true);
    setErrorMensaje("");
    setStatusMessage("");
    const context = accountContext.current;
    const stillCurrent = () => accountContext.current === context && context?.active && !context.invalidated;
    try {
      const account = await captureAccount();
      if (!account.isCurrent() || !stillCurrent()) return;
      await action(account.token, account.isCurrent);
      if (!account.isCurrent()) return;
      setStatusMessage(success);
      try {
        if (profileUsername && !await revalidarPerfilPublico(profileUsername)) {
          if (!account.isCurrent()) return;
          setStatusMessage(`${success} La página pública puede tardar en actualizarse; no repitas el guardado.`);
        }
      } catch {
        if (!account.isCurrent()) return;
        setStatusMessage(`${success} La actualización pública necesita reintentarse; no repitas el guardado.`);
      }
      if (!account.isCurrent()) return;
      await cargarProductos(profileId);
    } catch {
      if (!stillCurrent()) return;
      setRequiresReload(true);
      setErrorMensaje("No pudimos confirmar el cambio. Conservamos tus datos; recarga la lista. Si el producto cambió desde otra pestaña, copia tus cambios pendientes, cierra este formulario y abre la versión actual antes de guardar.");
    } finally {
      actionLock.current = false;
      if (stillCurrent()) setSaving(false);
    }
  }

  const guardar = async () => {
    if (!editing || !profileId || !editing.name.trim() || uploadInProgress) return;
    const price = Number(editing.price);
    if (!editing.price.trim() || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(editing.stock) || editing.stock < 0) {
      setErrorMensaje("Indica un precio válido y un stock entero mayor o igual a cero.");
      return;
    }
    const purchaseUrl = safeUrlOrNull(editing.purchaseUrl);
    if (editing.purchaseUrl.trim() && !purchaseUrl) {
      setErrorMensaje("Revisa el enlace de compra antes de guardar.");
      return;
    }
    await ejecutarCambio(async (token, isCurrent) => {
      const payload = { ...fullUpdatePayload(editing), title: editing.name.trim(), purchase_url: purchaseUrl };
      const result = isNew
        ? await supabase.from("products").insert({ id: editing.id, seller_id: profileId, type: "merch", position_index: products.length, ...payload }).select("id").single().setHeader("Authorization", `Bearer ${token}`)
        : await supabase.from("products").update(payload).eq("id", editing.id).eq("seller_id", profileId).eq("revision", requireCatalogRevision(editing)).select("id").single().setHeader("Authorization", `Bearer ${token}`);
      if (!isCurrent()) return;
      if (result.error || !result.data) throw new Error("Cambio no confirmado");
      setEditing(null);
    }, "Producto guardado.");
  };

  const eliminar = async (id: string) => {
    if (!profileId || actionLock.current || !window.confirm("¿Eliminar este producto de tu tienda? Esta acción no se puede deshacer desde este panel.")) return;
    await ejecutarCambio(async (token) => {
      const product = products.find((item) => item.id === id);
      if (!product) throw new Error("Producto no disponible");
      const { data, error } = await supabase.from("products").delete().eq("id", id).eq("seller_id", profileId).eq("revision", requireCatalogRevision(product)).select("id").single().setHeader("Authorization", `Bearer ${token}`);
      if (error || !data) throw new Error("Eliminación no confirmada");
    }, "Producto eliminado de la tienda.");
  };

  const toggleFlag = async (p: CatalogProduct, flag: "is_active" | "is_featured") => {
    const value = flag === "is_active" ? !p.isActive : !p.isFeatured;
    await ejecutarCambio(async (token) => {
      const { data, error } = await supabase.from("products").update({ [flag]: value }).eq("id", p.id).eq("seller_id", profileId).eq("revision", requireCatalogRevision(p)).select("id").single().setHeader("Authorization", `Bearer ${token}`);
      if (error || !data) throw new Error("Cambio no confirmado");
    }, "Visibilidad del producto actualizada.");
  };

  const cambiarStock = async (p: CatalogProduct, delta: number) => {
    if (!profileId || p.stock + delta < 0) return;
    await ejecutarCambio(async (token) => {
      // Compara el stock leído para no pisar un cambio de otra pestaña.
      const { data, error } = await supabase.from("products").update({ stock_quantity: p.stock + delta })
        .eq("id", p.id).eq("seller_id", profileId).eq("revision", requireCatalogRevision(p)).eq("stock_quantity", p.stock).select("id").single().setHeader("Authorization", `Bearer ${token}`);
      if (error || !data) throw new Error("Stock no confirmado");
    }, "Stock actualizado.");
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
        <div role="status" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          Cargando productos…
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
              <ShoppingBag className="size-6 text-primary" /> Tienda de Merch
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Vende lo que quieras: ropa, vinilos, instrumentos, arte, productos digitales, entradas...
              Todo lo que publiques aquí aparece en la sección Tienda de tu perfil público.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || requiresReload || !profileId || loadFailed || editing !== null}
            onClick={abrirNuevo}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Nuevo producto
          </button>
        </header>

        {errorMensaje && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{errorMensaje}</p>
            <button type="button" disabled={saving || uploadInProgress} onClick={() => { if (profileId) { void cargarProductos(profileId); } else { setLoading(true); setRetry(value => value + 1); } }} className="mt-2 min-h-11 rounded-lg border border-current px-3 py-2">Recargar lista sin descartar el formulario</button>
          </div>
        )}
        <p role="status" aria-live="polite" className="text-sm">{saving ? "Guardando cambio…" : statusMessage}</p>
        {/* ── Formulario de creación/edición ── */}
        {editing && ownerUserId && (
          <ProductForm
            key={editing.id}
            product={editing}
            ownerUserId={ownerUserId}
            isAccountCurrent={() => Boolean(accountContext.current?.active && !accountContext.current.invalidated && accountContext.current.owner === ownerUserId)}
            isNew={isNew}
            saving={saving}
            requiresReload={requiresReload}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={guardar}
            onUploadingChange={setUploadInProgress}
          />
        )}

        {/* ── Lista de productos ── */}
        {!loadFailed && (products.length === 0 && !editing ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Package className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium text-foreground">Tu tienda está vacía</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Agrega tu primer producto — puede ser físico o digital, de cualquier categoría.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <div
                key={p.id}
                className={`gradient-border-static gradient-border relative flex flex-col overflow-hidden rounded-2xl bg-card/60 ${
                  p.isActive ? "" : "opacity-55"
                }`}
              >
                <div className="relative aspect-4/3 overflow-hidden bg-background/60">
                  {p.images[0] ? (
                    <img src={p.images[0]} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground/40">
                      <Package className="size-10" />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      {productCategoryLabel(p.category).split(" (")[0]}
                    </span>
                    {p.kind === "digital" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/85 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        <Download className="size-2.5" /> Digital
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={saving || requiresReload || editing !== null}
                        onClick={() => toggleFlag(p, "is_featured")}
                    title={p.isFeatured ? "Quitar de destacados" : "Destacar en la tienda"}
                    className={`absolute right-2 top-2 flex size-11 items-center justify-center rounded-full backdrop-blur transition-colors ${
                      p.isFeatured ? "bg-primary text-primary-foreground" : "bg-black/50 text-white/80 hover:text-white"
                    }`}
                  >
                    <Star className={`size-3.5 ${p.isFeatured ? "fill-current" : ""}`} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-lg font-bold tabular-nums text-primary">
                    {p.currency} {Number(p.price || 0).toFixed(2)}
                  </p>

                  {p.kind === "fisico" && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        aria-label={`Reducir stock de ${p.name}`}
                        onClick={() => cambiarStock(p, -1)}
                        disabled={saving || requiresReload || editing !== null || p.stock <= 0}
                        className="flex size-11 items-center justify-center rounded bg-secondary font-bold text-foreground hover:bg-accent disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className={`w-14 text-center font-bold ${p.stock === 0 ? "text-destructive" : "text-emerald-500"}`}>
                        {p.stock} uds
                      </span>
                      <button
                        type="button"
                        disabled={saving || requiresReload || editing !== null}
                        aria-label={`Aumentar stock de ${p.name}`}
                        onClick={() => cambiarStock(p, 1)}
                        className="flex size-11 items-center justify-center rounded bg-secondary font-bold text-foreground hover:bg-accent"
                      >
                        +
                      </button>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.isActive}
                        aria-label={`Mostrar ${p.name} en la tienda`}
                        disabled={saving || requiresReload || editing !== null}
                        onClick={() => toggleFlag(p, "is_active")}
                        className={`relative h-5 w-9 rounded-full transition-colors ${p.isActive ? "bg-primary" : "bg-secondary"}`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                            p.isActive ? "translate-x-[18px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      {p.isActive ? "Visible" : "Oculto"}
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={saving || requiresReload || editing !== null}
                        onClick={() => abrirEdicion(p)}
                        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={saving || requiresReload || editing !== null}
                        onClick={() => eliminar(p.id)}
                        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </LayoutAdmin>
  );
}

// ─── Formulario de producto ────────────────────────────────────────────────

function ProductForm({
  product,
  ownerUserId,
  isAccountCurrent,
  isNew,
  saving,
  requiresReload,
  onChange,
  onCancel,
  onSave,
  onUploadingChange,
}: {
  product: CatalogProduct;
  ownerUserId: string;
  isAccountCurrent: () => boolean;
  isNew: boolean;
  saving: boolean;
  requiresReload: boolean;
  onChange: (p: CatalogProduct) => void;
  onCancel: () => void;
  onSave: () => void;
  onUploadingChange: (value: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [uploadError, setUploadError] = useState("");
  const [mustReselectImage, setMustReselectImage] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [variantDraft, setVariantDraft] = useState({ name: "", options: "" });
  const hasVariantDraft = Boolean(variantDraft.name.trim() || variantDraft.options.trim());
  const { dirty, canDiscard } = useUnsavedForm(product, pendingImage !== null || hasVariantDraft, saving || uploading);
  const cancelEditing = () => { if (!uploadLock.current && canDiscard()) onCancel(); };

  const subirImagen = async (file: File) => {
    if (!active.current || !isAccountCurrent() || uploadLock.current || saving || requiresReload || product.images.length >= 5) return;
    uploadLock.current = true;
    setPendingImage(file);
    setUploadError("");
    setMustReselectImage(false);
    setUploading(true);
    onUploadingChange(true);
    try {
      const url = await uploadImageNow(file, ownerUserId);
      if (!active.current || !isAccountCurrent()) return;
      onChange({ ...product, images: [...product.images, url].slice(0, 5) });
      setPendingImage(null);
    } catch (error) {
      if (!active.current || !isAccountCurrent()) return;
      setMustReselectImage(uploadRequiresNewFile(error));
      setUploadError(uploadFailureMessage(error, "No pudimos confirmar la subida de la imagen. Conservamos el archivo seleccionado mientras este formulario siga abierto."));
    } finally {
      uploadLock.current = false;
      if (active.current && isAccountCurrent()) {
        setUploading(false);
        onUploadingChange(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  };

  const agregarVariante = () => {
    const name = variantDraft.name.trim();
    const options = variantDraft.options.split(",").map((o) => o.trim()).filter(Boolean);
    if (!name || options.length === 0) return;
    const variants: ProductVariantGroup[] = [...product.variants, { name, options }];
    onChange({ ...product, variants });
    setVariantDraft({ name: "", options: "" });
  };

  return (
    <form onSubmit={event => { event.preventDefault(); if (!saving && !uploading && !pendingImage && !hasVariantDraft && !requiresReload) onSave(); }} aria-busy={saving || uploading} className="gradient-border relative rounded-2xl bg-card/60 p-5 backdrop-blur sm:p-6">
      {uploadError && <div role="alert" className="mb-4 text-sm text-destructive">
        <p>{uploadError}</p>
        <p>{mustReselectImage ? "Selecciona de nuevo o descarta la imagen pendiente antes de guardar." : "Reintenta o descarta la imagen pendiente antes de guardar."}</p>
        {pendingImage && <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" disabled={saving || uploading || requiresReload || product.images.length >= 5} onClick={() => mustReselectImage ? fileRef.current?.click() : void subirImagen(pendingImage)} className="min-h-11 rounded-lg border border-current px-3 disabled:opacity-50">{mustReselectImage ? "Seleccionar imagen de nuevo" : "Reintentar imagen"}</button>
          <button type="button" disabled={saving || uploading} onClick={() => { setPendingImage(null); setUploadError(""); }} className="min-h-11 px-3 underline disabled:opacity-50">Descartar imagen pendiente</button>
        </div>}
      </div>}
      <p role="status" className="text-sm">{uploading ? "Subiendo imagen…" : ""}</p>
      <fieldset disabled={saving || uploading || requiresReload} className="min-w-0 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          {isNew ? "Nuevo producto" : `Editar: ${product.name || "producto"}`}
        </h2>
        <button
          type="button"
          onClick={cancelEditing}
          aria-label="Cancelar edición del producto"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="product-name" className="text-xs font-medium text-muted-foreground">Nombre del producto *</label>
          <input
            type="text"
            required
            id="product-name"
            value={product.name}
            onChange={(e) => onChange({ ...product, name: e.target.value })}
            className={inputClass}
            placeholder="Ej. Vinilo edición limitada / Pack de samples"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="product-category" className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select
            id="product-category"
            value={product.category}
            onChange={(e) => onChange({ ...product, category: e.target.value })}
            className={inputClass}
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="product-description" className="text-xs font-medium text-muted-foreground">Descripción</label>
        <textarea
          id="product-description"
            value={product.description}
          onChange={(e) => onChange({ ...product, description: e.target.value })}
          rows={3}
          className={inputClass}
          placeholder="Materiales, qué incluye, historia del producto, formato de descarga..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <div className="flex gap-1 rounded-lg border border-input bg-background p-0.5">
            {(["fisico", "digital"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={product.kind === kind}
                onClick={() => onChange({ ...product, kind })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                  product.kind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {kind === "fisico" ? "Físico" : "Digital"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="product-price" className="text-xs font-medium text-muted-foreground">Precio *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            id="product-price"
            value={product.price}
            onChange={(e) => onChange({ ...product, price: e.target.value })}
            className={inputClass}
            placeholder="25.00"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="product-currency" className="text-xs font-medium text-muted-foreground">Moneda</label>
          <select
            id="product-currency"
            value={product.currency}
            onChange={(e) => onChange({ ...product, currency: e.target.value })}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {product.kind === "fisico" && (
          <div className="space-y-1.5">
            <label htmlFor="product-stock" className="text-xs font-medium text-muted-foreground">Stock</label>
            <input
              type="number"
              min="0"
              id="product-stock"
            value={product.stock}
              onChange={(e) => onChange({ ...product, stock: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className={inputClass}
              placeholder="50"
            />
          </div>
        )}
      </div>

      {/* Imágenes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Fotos (hasta 5)</label>
        <div className="flex flex-wrap gap-2">
          {product.images.map((url, i) => (
            <div key={`${url}-${i}`} className="group relative size-20 overflow-hidden rounded-lg border border-border">
              <img src={url} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onChange({ ...product, images: product.images.filter((_, idx) => idx !== i) })}
                aria-label={`Quitar foto ${i + 1}`}
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-bl-lg bg-black/60 text-white focus-visible:outline-2 focus-visible:outline-primary"
                title="Quitar foto"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {product.images.length < 5 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Añadir foto del producto"
              disabled={uploading}
              className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
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

      {/* Variantes */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Variantes (tallas, colores, formatos...)
        </label>
        {product.variants.map((v, i) => (
          <div key={`${v.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
            <span className="text-foreground">
              <strong>{v.name}:</strong> {v.options.join(", ")}
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...product, variants: product.variants.filter((_, idx) => idx !== i) })}
              aria-label={`Quitar variante ${v.name}`}
              className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={variantDraft.name}
            aria-label="Nombre de la variante"
            onChange={(e) => setVariantDraft((d) => ({ ...d, name: e.target.value }))}
            className={inputClass}
            placeholder="Nombre, ej. Talla"
          />
          <input
            type="text"
            value={variantDraft.options}
            aria-label="Opciones de la variante separadas por comas"
            onChange={(e) => setVariantDraft((d) => ({ ...d, options: e.target.value }))}
            className={inputClass}
            placeholder="Opciones separadas por coma, ej. S, M, L, XL"
          />
          <button
            type="button"
            onClick={agregarVariante}
            aria-label="Añadir variante"
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="product-purchase-url" className="text-xs font-medium text-muted-foreground">
            Enlace de compra (checkout externo, opcional)
          </label>
          <input
            type="text"
            inputMode="url"
            id="product-purchase-url"
            value={product.purchaseUrl}
            onChange={(e) => onChange({ ...product, purchaseUrl: e.target.value })}
            className={inputClass}
            placeholder="https://tu-tienda.com/producto — o déjalo vacío para 'Consultar'"
          />
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={product.isActive}
              onChange={(e) => onChange({ ...product, isActive: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Visible en la tienda
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={product.isFeatured}
              onChange={(e) => onChange({ ...product, isFeatured: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Destacado
          </label>
        </div>
      </div>

      {hasVariantDraft && (
        <div role="status" className="text-sm text-muted-foreground">
          Añade la variante que estás escribiendo o descártala antes de guardar.
          <button type="button" onClick={() => setVariantDraft({ name: "", options: "" })} className="ml-2 min-h-11 underline">Descartar variante pendiente</button>
        </div>
      )}
      {dirty && <p className="text-xs text-muted-foreground">Cambios sin guardar. Se conservan mientras este formulario siga abierto.</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={cancelEditing}
          aria-label="Cancelar edición del producto"
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || uploading || pendingImage !== null || hasVariantDraft || !product.name.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {isNew ? "Crear producto" : "Guardar cambios"}
        </button>
      </div>
      </fieldset>
    </form>
  );
}

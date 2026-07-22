"use client";

// Gestión completa de la tienda de merch: un músico puede vender CUALQUIER
// producto de su rubro — ropa, vinilos, instrumentos, arte, digitales,
// entradas... Cada producto tiene categoría, tipo (físico/digital), fotos,
// variantes (tallas/colores/formatos), precio con moneda, stock, enlace de
// compra externo, y flags de activo/destacado. Todo escribe directo en la
// tabla `products` (las columnas nuevas vienen de supabase/setup_vibra.sql;
// si la migración no corrió, se guarda lo básico y se avisa).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import LayoutAdmin from "@/components/LayoutAdmin";
import { uploadImageNow } from "@/lib/upload";
import {
  CURRENCIES,
  PRODUCT_CATEGORIES,
  productCategoryLabel,
  type CatalogProduct,
  type ProductVariantGroup,
  fetchCatalog,
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

function legacyUpdatePayload(p: CatalogProduct) {
  return {
    title: p.name,
    price: Number(p.price) || 0,
    images_urls: p.images,
    stock_quantity: p.stock,
  };
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? "");
}

export default function AdminMerchPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [avisoMigracion, setAvisoMigracion] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const cargarProductos = async (id: string) => {
    try {
      const { products: rows } = await fetchCatalog(id);
      setProducts(rows);
    } catch (err) {
      setErrorMensaje(err instanceof Error ? err.message : "No se pudieron cargar los productos.");
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
      cargarProductos(id);
    }
    verificarSesion();
  }, [router]);

  const abrirNuevo = () => {
    setEditing({ ...newProduct(), name: "", price: "" });
    setIsNew(true);
  };

  const abrirEdicion = (p: CatalogProduct) => {
    setEditing({ ...p });
    setIsNew(false);
  };

  const guardar = async () => {
    if (!editing || !profileId || !editing.name.trim()) return;
    setSaving(true);
    setErrorMensaje("");
    try {
      if (isNew) {
        const payload = {
          seller_id: profileId,
          type: "merch",
          position_index: products.length,
          ...fullUpdatePayload(editing),
        };
        const { error } = await supabase.from("products").insert([payload]);
        if (error) {
          if (!isMissingColumn(error)) throw error;
          setAvisoMigracion(true);
          const { error: legacyError } = await supabase.from("products").insert([
            { seller_id: profileId, type: "merch", position_index: products.length, ...legacyUpdatePayload(editing) },
          ]);
          if (legacyError) throw legacyError;
        }
      } else {
        const { error } = await supabase.from("products").update(fullUpdatePayload(editing)).eq("id", editing.id);
        if (error) {
          if (!isMissingColumn(error)) throw error;
          setAvisoMigracion(true);
          const { error: legacyError } = await supabase
            .from("products")
            .update(legacyUpdatePayload(editing))
            .eq("id", editing.id);
          if (legacyError) throw legacyError;
        }
      }
      setEditing(null);
      cargarProductos(profileId);
    } catch (err) {
      setErrorMensaje(err instanceof Error ? err.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id: string) => {
    if (!profileId) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) setErrorMensaje(error.message);
    else cargarProductos(profileId);
  };

  const toggleFlag = async (p: CatalogProduct, flag: "is_active" | "is_featured") => {
    if (!profileId) return;
    const value = flag === "is_active" ? !p.isActive : !p.isFeatured;
    const { error } = await supabase.from("products").update({ [flag]: value }).eq("id", p.id);
    if (error) {
      if (isMissingColumn(error)) setAvisoMigracion(true);
      else setErrorMensaje(error.message);
      return;
    }
    cargarProductos(profileId);
  };

  const cambiarStock = async (p: CatalogProduct, delta: number) => {
    if (!profileId || p.stock + delta < 0) return;
    const { error } = await supabase.from("products").update({ stock_quantity: p.stock + delta }).eq("id", p.id);
    if (error) setErrorMensaje(error.message);
    else cargarProductos(profileId);
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
              <ShoppingBag className="size-6 text-primary" /> Tienda de Merch
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Vende lo que quieras: ropa, vinilos, instrumentos, arte, productos digitales, entradas...
              Todo lo que publiques aquí aparece en la sección Tienda de tu perfil público.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirNuevo}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Nuevo producto
          </button>
        </header>

        {errorMensaje && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMensaje}
          </div>
        )}
        {avisoMigracion && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-500">
            Se guardó lo básico, pero los campos avanzados (categoría, variantes, enlace de compra...)
            necesitan que corras <code className="font-mono">supabase/setup_vibra.sql</code> una vez en el SQL Editor de Supabase.
          </div>
        )}

        {/* ── Formulario de creación/edición ── */}
        {editing && (
          <ProductForm
            product={editing}
            isNew={isNew}
            saving={saving}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={guardar}
          />
        )}

        {/* ── Lista de productos ── */}
        {products.length === 0 && !editing ? (
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
                    onClick={() => toggleFlag(p, "is_featured")}
                    title={p.isFeatured ? "Quitar de destacados" : "Destacar en la tienda"}
                    className={`absolute right-2 top-2 flex size-7 items-center justify-center rounded-full backdrop-blur transition-colors ${
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
                        onClick={() => cambiarStock(p, -1)}
                        disabled={p.stock <= 0}
                        className="flex size-6 items-center justify-center rounded bg-secondary font-bold text-foreground hover:bg-accent disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className={`w-14 text-center font-bold ${p.stock === 0 ? "text-destructive" : "text-emerald-500"}`}>
                        {p.stock} uds
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarStock(p, 1)}
                        className="flex size-6 items-center justify-center rounded bg-secondary font-bold text-foreground hover:bg-accent"
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
                        onClick={() => abrirEdicion(p)}
                        className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(p.id)}
                        className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
        )}
      </div>
    </LayoutAdmin>
  );
}

// ─── Formulario de producto ────────────────────────────────────────────────

function ProductForm({
  product,
  isNew,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  product: CatalogProduct;
  isNew: boolean;
  saving: boolean;
  onChange: (p: CatalogProduct) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [variantDraft, setVariantDraft] = useState({ name: "", options: "" });

  const subirImagen = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageNow(file);
      onChange({ ...product, images: [...product.images, url].slice(0, 5) });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
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
    <div className="gradient-border relative space-y-5 rounded-2xl bg-card/60 p-5 backdrop-blur sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          {isNew ? "Nuevo producto" : `Editar: ${product.name || "producto"}`}
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
          <label className="text-xs font-medium text-muted-foreground">Nombre del producto *</label>
          <input
            type="text"
            value={product.name}
            onChange={(e) => onChange({ ...product, name: e.target.value })}
            className={inputClass}
            placeholder="Ej. Vinilo edición limitada / Pack de samples"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select
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
        <label className="text-xs font-medium text-muted-foreground">Descripción</label>
        <textarea
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
          <label className="text-xs font-medium text-muted-foreground">Precio *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={product.price}
            onChange={(e) => onChange({ ...product, price: e.target.value })}
            className={inputClass}
            placeholder="25.00"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Moneda</label>
          <select
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
            <label className="text-xs font-medium text-muted-foreground">Stock</label>
            <input
              type="number"
              min="0"
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
                className="absolute inset-0 hidden items-center justify-center bg-black/60 text-white group-hover:flex"
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
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={variantDraft.name}
            onChange={(e) => setVariantDraft((d) => ({ ...d, name: e.target.value }))}
            className={inputClass}
            placeholder="Nombre, ej. Talla"
          />
          <input
            type="text"
            value={variantDraft.options}
            onChange={(e) => setVariantDraft((d) => ({ ...d, options: e.target.value }))}
            className={inputClass}
            placeholder="Opciones separadas por coma, ej. S, M, L, XL"
          />
          <button
            type="button"
            onClick={agregarVariante}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Enlace de compra (checkout externo, opcional)
          </label>
          <input
            type="url"
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

      <div className="flex justify-end gap-2 border-t border-border pt-4">
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
          disabled={saving || !product.name.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {isNew ? "Crear producto" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

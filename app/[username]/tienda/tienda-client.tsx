"use client";

// Página dedicada de Tienda y Servicios de un artista, separada del perfil
// (que solo tiene Legado / Trayectoria / Publicaciones). Está dividida en dos
// mitades con estéticas distintas: la izquierda es una VITRINA de productos
// (tipo tienda musical) y la derecha una CARTA de servicios profesionales. En
// escritorio se ven lado a lado; en móvil se alternan con un switch. Los datos
// salen de la tabla products/services vía fetchCatalog — la misma fuente que
// alimenta los bloques del editor.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  type CatalogProduct,
  type CatalogService,
  fetchCatalog,
  productCategoryLabel,
  serviceCategoryLabel,
  priceUnitLabel,
  serviceDurationLabel,
  formatMoney,
  rowToProduct,
  rowToService,
} from "@/lib/catalog";
import type { PerfilPublicoInicial } from "@/lib/supabase-server";
import { accentClassName, isAccentColor, type AccentColor } from "@/lib/theme";
import { ProfileSkeleton } from "@/components/blocks/skeletons";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";
import { safeUrlOrNull } from "@/lib/safe-url";
import { CatalogProductDetails } from "@/components/catalog-product-details";
import { isValidUsername, resolveProfileByUsername } from "@/lib/username";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  Check,
  Clock,
  Download,
  Globe,
  MapPin,
  Package,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Timer,
} from "lucide-react";

type LoadingState = "loading" | "error" | "success";
type MobileView = "productos" | "servicios";

// Mismo criterio que el perfil público (F10): el servidor resuelve el
// catálogo y lo pasa como filas crudas; acá se mapean con las mismas
// funciones que se aplicaban a la respuesta de PostgREST. `datosIniciales`
// es opcional: sin él, la tienda carga como antes.
export function TiendaClient({ datosIniciales }: { datosIniciales?: PerfilPublicoInicial }) {
  const params = useParams();
  const username = datosIniciales?.profile.username ?? (typeof params?.username === "string" ? params.username.trim().toLowerCase() : "");
  const [source, setSource] = useState({ datosIniciales, username, revision: 0 });
  if (source.datosIniciales !== datosIniciales || source.username !== username) {
    setSource({ datosIniciales, username, revision: source.revision + 1 });
  }
  return <TiendaSession key={source.revision} datosIniciales={datosIniciales} username={username} />;
}

function TiendaSession({ datosIniciales, username }: { datosIniciales?: PerfilPublicoInicial; username: string }) {
  const router = useRouter();

  const [iniciales] = useState(() =>
    datosIniciales
      ? {
          products: datosIniciales.productRows.map(rowToProduct).filter((p) => p.isActive !== false),
          services: datosIniciales.serviceRows.map(rowToService).filter((s) => s.isActive !== false),
        }
      : null
  );

  const acentoInicial = datosIniciales?.profile.accentColor;
  const [displayName, setDisplayName] = useState(
    datosIniciales ? datosIniciales.profile.displayName || datosIniciales.profile.username : ""
  );
  const [products, setProducts] = useState<CatalogProduct[]>(iniciales?.products ?? []);
  const [services, setServices] = useState<CatalogService[]>(iniciales?.services ?? []);
  const [accent, setAccent] = useState<AccentColor>(isAccentColor(acentoInicial) ? acentoInicial : "rojo");
  const [state, setState] = useState<LoadingState>(datosIniciales ? "success" : username ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState<string | null>(username ? null : "Perfil no especificado");
  const [view, setView] = useState<MobileView>("productos");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    // El servidor ya resolvió la tienda: nada que pedir desde el navegador.
    if (datosIniciales) return;

    if (!username) return;

    const controller = new AbortController();

    async function cargar() {
      try {
        // Igual que el perfil público: igualdad exacta por username, con
        // redirect si el enlace usa uno antiguo. Ver lib/username.ts.
        const profile = await resolveProfileByUsername(username, controller.signal);

        if (controller.signal.aborted) return;
        if (!profile) {
          setState("error");
          setErrorMessage("Artista no encontrado");
          return;
        }
        if (profile.redirectTo) {
          router.replace(`/${profile.redirectTo}/tienda`);
          return;
        }

        setDisplayName(profile.displayName || username);

        const { data: accentRow } = await supabase
          .from("profiles")
          .select("accent_color")
          .eq("id", profile.id)
          .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).maybeSingle();
        if (controller.signal.aborted) return;
        if (accentRow && isAccentColor(accentRow.accent_color)) setAccent(accentRow.accent_color);

        const { products: prods, services: servs } = await fetchCatalog(profile.id, undefined, controller.signal);
        if (controller.signal.aborted) return;

        setProducts(prods.filter((p) => p.isActive !== false));
        setServices(servs.filter((s) => s.isActive !== false));
        setState("success");
      } catch {
        if (controller.signal.aborted) return;
        setErrorMessage("No pudimos cargar la tienda. Revisa tu conexión y vuelve a intentarlo.");
        setState("error");
      }
    }

    cargar();
    return () => controller.abort();
  }, [username, router, datosIniciales, retry]);

  const backButton = (
    <Link
      href={username && isValidUsername(username) ? `/${username}` : "/"}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent/40"
    >
      <ArrowLeft className="size-3.5" />
      Volver al perfil
    </Link>
  );

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
        <div className="mb-6">{backButton}</div>
        <main className="mx-auto max-w-6xl">
          <ProfileSkeleton />
        </main>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        {backButton}
        <p role="alert" className="px-4 text-center text-sm font-semibold text-destructive">{errorMessage || "No se pudo cargar."}</p>
        <button type="button" disabled={!username} onClick={() => {
          setState("loading");
          setErrorMessage(null);
          setRetry(value => value + 1);
        }} className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Volver a cargar la tienda</button>
      </div>
    );
  }

  const hasProducts = products.length > 0;
  const hasServices = services.length > 0;

  return (
    <div className={`relative min-h-screen text-foreground ${accentClassName(accent)}`}>
      <AudioReactiveBackground />

      {/* Encabezado */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          {backButton}
          <div className="flex min-w-0 items-center gap-2">
            <Store className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold sm:text-base">{displayName}</span>
          </div>
        </div>

        {/* Switch móvil Productos | Servicios (solo si hay de ambos) */}
        {hasProducts && hasServices && (
          <div className="mx-auto mt-3 flex max-w-6xl gap-1 rounded-full border border-border bg-card/70 p-1 lg:hidden">
            {(["productos", "servicios"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-11 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {!hasProducts && !hasServices ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <Store className="size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Aún no hay nada publicado en esta tienda.</p>
          </div>
        ) : (
          <div className={`grid gap-8 lg:gap-10 ${hasProducts && hasServices ? "lg:grid-cols-2" : ""}`}>
            {/* ── Mitad izquierda: PRODUCTOS (vitrina) ─────────────────── */}
            {hasProducts && (
              <section className={!hasServices || view === "productos" ? "block" : "hidden lg:block"}>
                <SectionHeader
                  icon={ShoppingBag}
                  eyebrow="Tienda"
                  title="Productos"
                  count={products.length}
                  countLabel={products.length === 1 ? "producto" : "productos"}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Mitad derecha: SERVICIOS (carta profesional) ─────────── */}
            {hasServices && (
              <section className={!hasProducts || view === "servicios" ? "block" : "hidden lg:block"}>
                <SectionHeader
                  icon={Sparkles}
                  eyebrow="Trabaja conmigo"
                  title="Servicios"
                  count={services.length}
                  countLabel={services.length === 1 ? "servicio" : "servicios"}
                />
                <div className="flex flex-col gap-4">
                  {services.map((s) => (
                    <ServiceCard key={s.id} service={s} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Encabezado de sección ────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  count,
  countLabel,
}: {
  icon: typeof ShoppingBag;
  eyebrow: string;
  title: string;
  count: number;
  countLabel: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          <Icon className="size-3.5" /> {eyebrow}
        </p>
        <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {count} {countLabel}
      </span>
    </div>
  );
}

// ─── Tarjeta de producto (estética tienda) ────────────────────────────────

function ProductCard({ product }: { product: CatalogProduct }) {
  const value = Number(product.price);
  const price =
    product.price === "" || Number.isNaN(value) ? "Consultar" : formatMoney(value, product.currency);
  const image = product.imageUrl || product.images?.[0];
  const soldOut = product.kind !== "digital" && product.stock <= 0;
  const purchaseUrl = safeUrlOrNull(product.purchaseUrl);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card/50 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_16px_40px_-16px_var(--primary)]">
      <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <Package className="size-10" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {product.isFeatured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              <Sparkles className="size-2.5" /> Top
            </span>
          )}
          {product.kind === "digital" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/85 px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
              <Download className="size-2.5" /> Digital
            </span>
          ) : soldOut ? (
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
              Agotado
            </span>
          ) : product.stock <= 5 ? (
            <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-semibold text-black">
              ¡Últimas {product.stock}!
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Tag className="size-2.5" /> {productCategoryLabel(product.category)}
        </span>
        <p className="break-words text-sm font-semibold">{product.name}</p>
        <CatalogProductDetails product={product} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <p className="text-base font-bold tabular-nums text-primary">{price}</p>
          {soldOut ? (
            <span className="text-xs font-medium text-muted-foreground">Agotado</span>
          ) : purchaseUrl ? (
            <a
              href={purchaseUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={`Comprar ${product.name} (abre otra pestaña)`}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Comprar
              <ArrowUpRight className="size-3.5" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">
              Sin enlace de compra
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de servicio (estética profesional) ───────────────────────────

function ServiceCard({ service }: { service: CatalogService }) {
  const value = Number(service.price);
  const hasPrice = service.price !== "" && !Number.isNaN(value) && value > 0;
  const modality =
    service.modality === "presencial" ? "Presencial" : service.modality === "online" ? "Online" : "Presencial u online";
  const duration = serviceDurationLabel(service);
  const bookingUrl = safeUrlOrNull(service.bookingUrl);

  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card/50 p-5 transition-all duration-300 hover:shadow-[0_16px_40px_-18px_var(--primary)] ${
        service.isFeatured ? "border-primary/50" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
          {serviceCategoryLabel(service.category)}
        </span>
        {service.isFeatured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
            <Sparkles className="size-2.5" /> Destacado
          </span>
        )}
      </div>

      <p className="text-lg font-semibold">{service.title || "Servicio"}</p>

      {service.description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{service.description}</p>
      )}

      {(service.features?.length ?? 0) > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {service.features.map((f, i) => (
            <li key={`${f}-${i}`} className="flex items-start gap-1.5 text-xs text-foreground/85">
              <Check className="mt-0.5 size-3 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {service.modality === "online" ? <Globe className="size-3" /> : <MapPin className="size-3" />}
          {modality}
        </span>
        {duration && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {duration}
          </span>
        )}
        {service.deliveryTime && (
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3" /> Entrega: {service.deliveryTime}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-xl font-bold tabular-nums text-primary">
          {hasPrice ? formatMoney(value, service.currency) : "A convenir"}
          {hasPrice && (
            <span className="ml-1 text-xs font-medium text-muted-foreground">{priceUnitLabel(service.priceUnit)}</span>
          )}
        </p>
        {bookingUrl ? (
          <a
            href={bookingUrl}
            aria-label={`Reservar o cotizar ${service.title} (abre otra pestaña)`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-[0_0_24px_-8px_var(--primary)] transition-all hover:opacity-90"
          >
            <CalendarCheck className="size-3.5" />
            Reservar / Cotizar
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : <span className="text-xs text-muted-foreground">Sin enlace de reserva</span>}
      </div>
    </div>
  );
}

import { supabase } from "@/lib/supabase"

// ─── Catálogo completo de la tienda del músico ────────────────────────────
// Un producto puede ser CUALQUIER cosa que un músico venda, sea cual sea su
// rubro: ropa, vinilos/CDs, instrumentos, arte, descargas digitales
// (samples, partituras, presets), entradas, etc. Un servicio puede ser
// cualquier cosa que un músico ofrezca: clases, producción, mezcla/máster,
// composición, sesiones, shows en vivo, alquiler de equipo...
//
// Los campos nuevos viven en columnas agregadas por supabase/setup_vibra.sql.
// Mientras esa migración no corra, fetchCatalog degrada con valores por
// defecto y publishCatalog reintenta con el payload mínimo legacy.

export type ProductKind = "fisico" | "digital"

export type ProductVariantGroup = {
  // Ej. name: "Talla", options: ["S", "M", "L", "XL"]
  name: string
  options: string[]
}

export type CatalogProduct = {
  id: string
  name: string
  price: string
  currency: string
  imageUrl?: string
  images: string[]
  description: string
  category: string
  kind: ProductKind
  variants: ProductVariantGroup[]
  purchaseUrl: string
  stock: number
  isActive: boolean
  isFeatured: boolean
}

export type CatalogService = {
  id: string
  title: string
  price: string
  priceUnit: string
  description: string
  category: string
  modality: "presencial" | "online" | "ambas"
  duration: string
  deliveryTime: string
  features: string[]
  bookingUrl: string
  imageUrl: string
  isActive: boolean
  isFeatured: boolean
}

export const PRODUCT_CATEGORIES = [
  { id: "ropa", label: "Ropa y textil" },
  { id: "musica-fisica", label: "Música física (vinilos, CDs, casetes)" },
  { id: "accesorios", label: "Accesorios" },
  { id: "instrumentos", label: "Instrumentos y equipo" },
  { id: "arte", label: "Arte y coleccionables" },
  { id: "digital", label: "Productos digitales (samples, partituras, presets)" },
  { id: "entradas", label: "Entradas y experiencias" },
  { id: "otro", label: "Otro" },
] as const

export const SERVICE_CATEGORIES = [
  { id: "clases", label: "Clases y mentoría" },
  { id: "produccion", label: "Producción musical" },
  { id: "mezcla-master", label: "Mezcla y masterización" },
  { id: "composicion", label: "Composición y arreglos" },
  { id: "sesion", label: "Músico de sesión / grabación" },
  { id: "shows", label: "Shows en vivo y eventos" },
  { id: "alquiler", label: "Alquiler de equipo o sala" },
  { id: "otro", label: "Otro" },
] as const

export const PRICE_UNITS = [
  { id: "proyecto", label: "por proyecto" },
  { id: "hora", label: "por hora" },
  { id: "sesion", label: "por sesión" },
  { id: "cancion", label: "por canción" },
  { id: "evento", label: "por evento" },
  { id: "mes", label: "por mes" },
] as const

export const CURRENCIES = ["USD", "PEN", "MXN", "COP", "ARS", "EUR"] as const

export function productCategoryLabel(id: string): string {
  return PRODUCT_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export function serviceCategoryLabel(id: string): string {
  return SERVICE_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export function priceUnitLabel(id: string): string {
  return PRICE_UNITS.find((u) => u.id === id)?.label ?? ""
}

function toPriceNumber(price: string): number {
  const parsed = Number(price)
  return price.trim() === "" || Number.isNaN(parsed) ? 0 : parsed
}

function normalizeVariants(raw: unknown): ProductVariantGroup[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((g) => {
      const group = (g && typeof g === "object" ? g : {}) as Record<string, unknown>
      return {
        name: String(group.name ?? ""),
        options: Array.isArray(group.options) ? group.options.map(String).filter(Boolean) : [],
      }
    })
    .filter((g) => g.name || g.options.length > 0)
}

function normalizeFeatures(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

export function newProduct(): CatalogProduct {
  return {
    id: crypto.randomUUID(),
    name: "Nuevo Producto",
    price: "0.00",
    currency: "USD",
    images: [],
    description: "",
    category: "otro",
    kind: "fisico",
    variants: [],
    purchaseUrl: "",
    stock: 10,
    isActive: true,
    isFeatured: false,
  }
}

export function newService(): CatalogService {
  return {
    id: crypto.randomUUID(),
    title: "Nuevo Servicio",
    price: "0.00",
    priceUnit: "proyecto",
    description: "",
    category: "otro",
    modality: "ambas",
    duration: "",
    deliveryTime: "",
    features: [],
    bookingUrl: "",
    imageUrl: "",
    isActive: true,
    isFeatured: false,
  }
}

/**
 * Repara productos/servicios guardados en profiles.draft_content ANTES del
 * rediseño de tienda (2026-07-19), cuando CatalogProduct/CatalogService
 * tenían menos campos (sin images[], variants[], features[]). Sin esto, un
 * borrador viejo llega con esas propiedades undefined y rompe tanto el
 * render (MerchBlock/ServiceBlock indexan images[0], features.length) como
 * publishCatalog (productImages hace images.filter). Se aplica al leer
 * cualquier draft — nunca hace falta tocar filas ya publicadas, esas siempre
 * pasan por rowToProduct/rowToService.
 */
export function normalizeDraftProduct(raw: unknown): CatalogProduct {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const images = Array.isArray(p.images) ? p.images.map(String).filter(Boolean) : []
  return {
    id: String(p.id ?? crypto.randomUUID()),
    name: String(p.name ?? ""),
    price: p.price != null ? String(p.price) : "0.00",
    currency: typeof p.currency === "string" && p.currency ? p.currency : "USD",
    imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : images[0],
    images,
    description: typeof p.description === "string" ? p.description : "",
    category: typeof p.category === "string" && p.category ? p.category : "otro",
    kind: p.kind === "digital" ? "digital" : "fisico",
    variants: normalizeVariants(p.variants),
    purchaseUrl: typeof p.purchaseUrl === "string" ? p.purchaseUrl : "",
    stock: typeof p.stock === "number" ? p.stock : Number(p.stock ?? 0) || 0,
    isActive: p.isActive === undefined || p.isActive === null ? true : Boolean(p.isActive),
    isFeatured: Boolean(p.isFeatured),
  }
}

export function normalizeDraftService(raw: unknown): CatalogService {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    id: String(s.id ?? crypto.randomUUID()),
    title: String(s.title ?? ""),
    price: s.price != null ? String(s.price) : "0.00",
    priceUnit: typeof s.priceUnit === "string" && s.priceUnit ? s.priceUnit : "proyecto",
    description: typeof s.description === "string" ? s.description : "",
    category: typeof s.category === "string" && s.category ? s.category : "otro",
    modality: s.modality === "presencial" || s.modality === "online" ? s.modality : "ambas",
    duration: typeof s.duration === "string" ? s.duration : "",
    deliveryTime: typeof s.deliveryTime === "string" ? s.deliveryTime : "",
    features: normalizeFeatures(s.features),
    bookingUrl: typeof s.bookingUrl === "string" ? s.bookingUrl : "",
    imageUrl: typeof s.imageUrl === "string" ? s.imageUrl : "",
    isActive: s.isActive === undefined || s.isActive === null ? true : Boolean(s.isActive),
    isFeatured: Boolean(s.isFeatured),
  }
}

type Row = Record<string, unknown>

function rowToProduct(p: Row): CatalogProduct {
  const images = Array.isArray(p.images_urls) ? (p.images_urls as unknown[]).map(String).filter(Boolean) : []
  return {
    id: String(p.id),
    name: String(p.title ?? ""),
    price: p.price != null ? String(p.price) : "",
    currency: typeof p.currency === "string" && p.currency ? p.currency : "USD",
    imageUrl: images[0],
    images,
    description: typeof p.description === "string" ? p.description : "",
    category: typeof p.category === "string" && p.category ? p.category : "otro",
    kind: p.product_kind === "digital" ? "digital" : "fisico",
    variants: normalizeVariants(p.variants),
    purchaseUrl: typeof p.purchase_url === "string" ? p.purchase_url : "",
    stock: typeof p.stock_quantity === "number" ? p.stock_quantity : Number(p.stock_quantity ?? 0) || 0,
    isActive: p.is_active === undefined || p.is_active === null ? true : Boolean(p.is_active),
    isFeatured: Boolean(p.is_featured),
  }
}

function rowToService(s: Row): CatalogService {
  return {
    id: String(s.id),
    title: String(s.title ?? ""),
    price: s.price != null ? String(s.price) : "",
    priceUnit: typeof s.price_unit === "string" && s.price_unit ? s.price_unit : "proyecto",
    description: typeof s.description === "string" ? s.description : "",
    category: typeof s.category === "string" && s.category ? s.category : "otro",
    modality: s.modality === "presencial" || s.modality === "online" ? s.modality : "ambas",
    duration: typeof s.duration === "string" ? s.duration : "",
    deliveryTime: typeof s.delivery_time === "string" ? s.delivery_time : "",
    features: normalizeFeatures(s.features),
    bookingUrl: typeof s.booking_url === "string" ? s.booking_url : "",
    imageUrl: typeof s.image_url === "string" ? s.image_url : "",
    isActive: s.is_active === undefined || s.is_active === null ? true : Boolean(s.is_active),
    isFeatured: Boolean(s.is_featured),
  }
}

export async function fetchCatalog(profileId: string) {
  // select("*"): las columnas nuevas pueden no existir todavía (migración
  // pendiente) — pidiendo todo, lo que falte simplemente llega undefined y
  // el mapeo aplica valores por defecto.
  const [{ data: productRows, error: productsError }, { data: serviceRows, error: servicesError }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("seller_id", profileId)
      .order("position_index", { ascending: true }),
    supabase
      .from("services")
      .select("*")
      .eq("profile_id", profileId)
      .order("position_index", { ascending: true }),
  ])

  if (productsError) throw productsError
  if (servicesError) throw servicesError

  const products: CatalogProduct[] = (productRows ?? []).map(rowToProduct)
  const services: CatalogService[] = (serviceRows ?? []).map(rowToService)

  return { products, services }
}

function productImages(p: CatalogProduct): string[] {
  // El inspector del editor solo edita `imageUrl` (foto principal); el panel
  // admin edita `images` completo. La principal manda: si difiere de
  // images[0], se antepone sin duplicar. Array.isArray por si llega un
  // producto de un borrador viejo sin `images` (ver normalizeDraftProduct).
  const images = Array.isArray(p.images) ? p.images : []
  if (p.imageUrl) return [p.imageUrl, ...images.filter((u) => u && u !== p.imageUrl)]
  return images.filter(Boolean)
}

function productFullPayload(p: CatalogProduct, profileId: string, i: number) {
  const images = productImages(p)
  return {
    seller_id: profileId,
    type: "merch",
    title: p.name,
    price: toPriceNumber(p.price),
    images_urls: images,
    stock_quantity: p.stock,
    position_index: i,
    description: p.description || null,
    category: p.category || "otro",
    product_kind: p.kind,
    currency: p.currency || "USD",
    variants: p.variants,
    purchase_url: p.purchaseUrl || null,
    is_active: p.isActive,
    is_featured: p.isFeatured,
  }
}

function productLegacyPayload(p: CatalogProduct, profileId: string, i: number) {
  const images = productImages(p)
  return {
    seller_id: profileId,
    type: "merch",
    title: p.name,
    price: toPriceNumber(p.price),
    images_urls: images,
    stock_quantity: p.stock,
    position_index: i,
  }
}

function serviceFullPayload(s: CatalogService, profileId: string, i: number) {
  return {
    profile_id: profileId,
    title: s.title,
    price: toPriceNumber(s.price),
    description: s.description || null,
    position_index: i,
    category: s.category || "otro",
    price_unit: s.priceUnit,
    modality: s.modality,
    duration: s.duration || null,
    delivery_time: s.deliveryTime || null,
    features: s.features,
    booking_url: s.bookingUrl || null,
    image_url: s.imageUrl || null,
    is_active: s.isActive,
    is_featured: s.isFeatured,
  }
}

function serviceLegacyPayload(s: CatalogService, profileId: string, i: number) {
  return {
    profile_id: profileId,
    title: s.title,
    price: toPriceNumber(s.price),
    description: s.description || null,
    position_index: i,
  }
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42703 = undefined_column; PGRST204 = columna desconocida vía PostgREST.
  return error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? "")
}

export async function publishCatalog(profileId: string, products: CatalogProduct[], services: CatalogService[]) {
  const { error: deleteProductsError } = await supabase.from("products").delete().eq("seller_id", profileId)
  if (deleteProductsError) throw deleteProductsError

  const { error: deleteServicesError } = await supabase.from("services").delete().eq("profile_id", profileId)
  if (deleteServicesError) throw deleteServicesError

  if (products.length > 0) {
    const { error } = await supabase.from("products").insert(products.map((p, i) => productFullPayload(p, profileId, i)))
    if (error) {
      // Migración pendiente: reintenta con el payload legacy para no perder
      // la publicación (los campos nuevos quedan en el borrador del editor).
      if (!isMissingColumnError(error)) throw error
      const { error: legacyError } = await supabase
        .from("products")
        .insert(products.map((p, i) => productLegacyPayload(p, profileId, i)))
      if (legacyError) throw legacyError
    }
  }

  if (services.length > 0) {
    const { error } = await supabase.from("services").insert(services.map((s, i) => serviceFullPayload(s, profileId, i)))
    if (error) {
      if (!isMissingColumnError(error)) throw error
      const { error: legacyError } = await supabase
        .from("services")
        .insert(services.map((s, i) => serviceLegacyPayload(s, profileId, i)))
      if (legacyError) throw legacyError
    }
  }
}

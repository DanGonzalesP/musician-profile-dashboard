import { supabase } from "@/lib/supabase"

export type CatalogProduct = {
  id: string
  name: string
  price: string
  imageUrl?: string
  stock: number
}

export type CatalogService = {
  id: string
  title: string
  price: string
  description: string
}

type ProductRow = {
  id: string
  title: string
  price: number | null
  images_urls: string[] | null
  stock_quantity: number | null
}

type ServiceRow = {
  id: number
  title: string
  price: number | null
  description: string | null
}

function toPriceNumber(price: string): number {
  const parsed = Number(price)
  return price.trim() === "" || Number.isNaN(parsed) ? 0 : parsed
}

export function newProduct(): CatalogProduct {
  return { id: crypto.randomUUID(), name: "Nuevo Producto", price: "0.00", stock: 10 }
}

export function newService(): CatalogService {
  return { id: crypto.randomUUID(), title: "Nuevo Servicio", price: "0.00", description: "" }
}

export async function fetchCatalog(profileId: string) {
  const [{ data: productRows, error: productsError }, { data: serviceRows, error: servicesError }] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, price, images_urls, stock_quantity")
      .eq("seller_id", profileId)
      .order("position_index", { ascending: true }),
    supabase
      .from("services")
      .select("id, title, price, description")
      .eq("profile_id", profileId)
      .order("position_index", { ascending: true }),
  ])

  if (productsError) throw productsError
  if (servicesError) throw servicesError

  const products: CatalogProduct[] = (productRows ?? []).map((p: ProductRow) => ({
    id: String(p.id),
    name: p.title,
    price: p.price != null ? String(p.price) : "",
    imageUrl: p.images_urls?.[0] ?? undefined,
    stock: p.stock_quantity ?? 0,
  }))

  const services: CatalogService[] = (serviceRows ?? []).map((s: ServiceRow) => ({
    id: String(s.id),
    title: s.title,
    price: s.price != null ? String(s.price) : "",
    description: s.description ?? "",
  }))

  return { products, services }
}

export async function publishCatalog(profileId: string, products: CatalogProduct[], services: CatalogService[]) {
  const { error: deleteProductsError } = await supabase.from("products").delete().eq("seller_id", profileId)
  if (deleteProductsError) throw deleteProductsError

  const { error: deleteServicesError } = await supabase.from("services").delete().eq("profile_id", profileId)
  if (deleteServicesError) throw deleteServicesError

  if (products.length > 0) {
    const productPayload = products.map((p, i) => ({
      seller_id: profileId,
      type: "merch",
      title: p.name,
      price: toPriceNumber(p.price),
      images_urls: p.imageUrl ? [p.imageUrl] : [],
      stock_quantity: p.stock,
      position_index: i,
    }))
    const { error } = await supabase.from("products").insert(productPayload)
    if (error) throw error
  }

  if (services.length > 0) {
    const servicePayload = services.map((s, i) => ({
      profile_id: profileId,
      title: s.title,
      price: toPriceNumber(s.price),
      description: s.description || null,
      position_index: i,
    }))
    const { error } = await supabase.from("services").insert(servicePayload)
    if (error) throw error
  }
}

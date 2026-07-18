// Las 5 categorías profesionales del feed — una sola palabra cada una en el
// menú principal; el detalle (subroles) solo aparece como descripción.
// Los ids coinciden con el check de supabase/profiles_musician_category.sql.

export type MusicianCategory = "autores" | "productores" | "directores" | "interpretes" | "tecnicos"

export const MUSICIAN_CATEGORIES: {
  id: MusicianCategory
  label: string
  description: string
}[] = [
  { id: "autores", label: "Autores", description: "Compositores musicales y letristas" },
  { id: "productores", label: "Productores", description: "Directores de obra, beatmakers y topliners" },
  { id: "directores", label: "Directores", description: "Arreglistas y directores de orquesta" },
  { id: "interpretes", label: "Intérpretes", description: "Vocalistas, músicos de sesión y coristas" },
  { id: "tecnicos", label: "Técnicos", description: "Ingenieros de grabación, mezcla y mastering" },
]

export function isMusicianCategory(value: unknown): value is MusicianCategory {
  return typeof value === "string" && MUSICIAN_CATEGORIES.some((c) => c.id === value)
}

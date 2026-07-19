import { createClient } from "@supabase/supabase-js"

// Validación de sesión para las API routes. El cliente manda su access token
// de Supabase en el header Authorization ("Bearer <jwt>") y aquí se verifica
// contra Supabase Auth antes de hacer cualquier trabajo (firmar URLs de
// subida, llamar a la IA de imágenes...). Sin token válido → 401.

export async function getAuthenticatedUser(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}

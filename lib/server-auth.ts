import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Validación de sesión para las API routes. El cliente manda su access token
// de Supabase en el header Authorization ("Bearer <jwt>") y aquí se verifica
// contra Supabase Auth antes de hacer cualquier trabajo (firmar URLs de
// subida, llamar a la IA de imágenes...). Sin token válido → 401.

function bearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization") ?? ""
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
}

export async function getAuthenticatedUser(request: Request): Promise<{ id: string } | null> {
  const token = bearerToken(request)
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

/**
 * Igual que getAuthenticatedUser, pero además devuelve un cliente de Supabase
 * que actúa EN NOMBRE DEL USUARIO (lleva su JWT en cada request).
 *
 * Por qué importa: un cliente creado solo con la anon key es anónimo, así que
 * `auth.uid()` es null dentro de las políticas de RLS y cualquier escritura
 * atada al dueño falla. Con el token del usuario adjunto, las políticas se
 * evalúan con su identidad real — o sea que la base sigue siendo la que
 * decide qué puede tocar, no la API route. Eso es exactamente lo que
 * queremos: si mañana alguien se equivoca en una ruta, RLS sigue siendo la
 * última línea de defensa.
 *
 * Nunca usar la service role key para esto: saltearía RLS por completo.
 */
export async function getAuthenticatedContext(
  request: Request
): Promise<{ user: { id: string }; supabase: SupabaseClient } | null> {
  const token = bearerToken(request)
  if (!token) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return { user: { id: data.user.id }, supabase }
}

import { supabase } from "@/lib/supabase"

// fetch() hacia nuestras propias API routes con el access token de la sesión
// de Supabase — las rutas /api/* lo exigen (ver lib/server-auth.ts).

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

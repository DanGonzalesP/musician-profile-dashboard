import { createClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

/** Sesión efímera: updateUser no puede leer ni sobrescribir las cookies de otra
 * cuenta si cambia la sesión mientras se procesa la recuperación. */
export async function updateOwnPassword(ownerUserId: string, password: string, isCurrent: () => boolean): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  const session = data.session
  if (!isCurrent() || error || !session || session.user.id !== ownerUserId) throw new Error("session changed")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("configuration unavailable")
  const userEndpoint = `${url.replace(/\/$/, "")}/auth/v1/user`
  const isolated = createClient(url, key, {
    auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: `vibe-password-${crypto.randomUUID()}`,
    },
    global: { fetch: async (input, init) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const method = init?.method?.toUpperCase() ?? "GET"
      // Nunca renovar el refresh token desde este cliente aislado: corresponde
      // al cliente compartido. Si caduca, el usuario debe reintentar con él.
      if (!isCurrent() || target !== userEndpoint || !["GET", "PUT"].includes(method)) throw new Error("session unavailable")
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${session.access_token}`)
      return fetch(input, { ...init, headers, credentials: "omit", cache: "no-store", redirect: "error" })
    } },
  })
  try {
    const established = await isolated.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    if (!isCurrent() || established.error || established.data.user?.id !== ownerUserId) throw new Error("session unavailable")
    const updated = await isolated.auth.updateUser({ password })
    if (updated.error || updated.data.user?.id !== ownerUserId) throw new Error("password update unconfirmed")
  } finally {
    // Libera recursos, no hace signOut ni revoca la sesión del navegador.
    await isolated.auth.dispose()
  }
}

"use server"

import { cookies } from "next/headers"
import { revalidatePath, revalidateTag } from "next/cache"
import { createServerClient } from "@supabase/ssr"
import { etiquetaPerfil } from "@/lib/supabase-server"

// Invalidación de la caché del perfil público al publicar (F10).
//
// El perfil público se sirve desde una entrada cacheada y etiquetada
// (`lib/supabase-server.ts`). Sin esto, un artista publicaría un cambio y
// seguiría viendo lo viejo hasta 5 minutos — que es exactamente la clase de
// "no se guardó nada" que este proyecto ya persiguió antes.
//
// Es una Server Action porque `revalidateTag` sólo puede llamarse desde el
// servidor, y el editor es un componente cliente.
//
// SEGURIDAD — una Server Action es un endpoint POST público: cualquiera que
// conozca su identificador puede invocarla, no sólo el editor. No lee ni
// escribe datos y no revela nada, pero sí obliga a la siguiente visita a
// recalcular la página contra Supabase. Sin ninguna barrera, un bucle contra
// los perfiles más visitados convierte la caché —que existe justamente para no
// golpear la base— en un amplificador de carga.
//
// Por eso hay dos comprobaciones, en este orden:
//   1. Forma del username, antes de tocar nada: no se fabrican etiquetas de
//      caché arbitrarias con lo que llegue por la red.
//   2. Sesión válida y rol owner/admin del perfil, evaluado en Postgres con
//      el JWT real. Tener cualquier cuenta no autoriza invalidar a otros.
//
// Devuelve false si no puede confirmar la invalidación. Es best-effort: un
// fallo de caché no revierte ni exige repetir una escritura ya confirmada.

const USERNAME_VALIDO = /^[a-z0-9_]{3,30}$/

async function nombresAutorizados(username: string, anterior?: string): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return []

  const almacen = await cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return almacen.getAll()
      },
      // La acción no renueva la sesión: sólo la lee. Si el token está vencido,
      // `getUser()` devuelve null y la invalidación no ocurre, que es la falla
      // segura.
      setAll() {},
    },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return []
  const profile = await supabase.from("profiles").select("id").eq("username", username).maybeSingle()
  if (profile.error || !profile.data) return []
  const role = await supabase.rpc("get_profile_role", { target_profile_id: profile.data.id })
  if (role.error || (role.data !== "owner" && role.data !== "admin")) return []
  if (anterior && anterior !== username) {
    // El cliente no decide qué alias pertenece a la cuenta. El historial
    // creado por la base debe vincularlo al mismo perfil autorizado.
    const history = await supabase.from("username_history").select("profile_id")
      .eq("old_username", anterior).eq("profile_id", profile.data.id).maybeSingle()
    if (history.error || !history.data) return []
    return [username, anterior]
  }
  return [username]
}

export async function revalidarPerfilPublico(username: string, usernameAnterior?: string): Promise<boolean> {
  if (typeof username !== "string" || (usernameAnterior !== undefined && typeof usernameAnterior !== "string")) return false
  const limpio = username.trim().toLowerCase()
  const anterior = usernameAnterior?.trim().toLowerCase()
  if (!USERNAME_VALIDO.test(limpio) || (anterior !== undefined && !USERNAME_VALIDO.test(anterior))) return false
  try {
    const nombres = await nombresAutorizados(limpio, anterior)
    if (nombres.length === 0) return false

  // La etiqueta cubre los datos (perfil, bloques y catálogo, en la misma
  // entrada); las rutas cubren el HTML ya renderizado de las dos páginas
  // públicas del artista.
  //
  // `expire: 0` = sin ventana de "sirve lo viejo mientras regenera". Para un
  // catálogo daría igual, pero acá el caso de uso es el artista que acaba de
  // publicar y abre su propio perfil para comprobarlo: si le servimos lo
  // anterior, para él el botón "Publicar" no funcionó.
    for (const nombre of nombres) {
      revalidateTag(etiquetaPerfil(nombre), { expire: 0 })
      revalidatePath(`/${nombre}`)
      revalidatePath(`/${nombre}/tienda`)
    }
    return true
  } catch {
    return false
  }
}

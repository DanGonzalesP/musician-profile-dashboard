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
//   2. Sesión válida de Supabase, leída de la cookie. No se exige ser el dueño
//      del perfil: invalidar la caché de otro no filtra ni corrompe nada, y
//      atarlo a la propiedad obligaría a resolver el perfil (otra consulta) en
//      el camino caliente de la publicación. Exigir sesión ya saca del alcance
//      al internet anónimo, que es de donde vendría el abuso.
//
// Falla en silencio a propósito: quien la llama la trata como best-effort (ver
// `handlePublish`), y una publicación correcta nunca debe convertirse en un
// error porque la caché no se pudo marcar.

const USERNAME_VALIDO = /^[a-z0-9_]{3,30}$/

async function haySesion(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false

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
  } = await supabase.auth.getUser()
  return Boolean(user)
}

export async function revalidarPerfilPublico(username: string): Promise<void> {
  const limpio = (username ?? "").trim().toLowerCase()
  if (!USERNAME_VALIDO.test(limpio)) return
  if (!(await haySesion())) return

  // La etiqueta cubre los datos (perfil, bloques y catálogo, en la misma
  // entrada); las rutas cubren el HTML ya renderizado de las dos páginas
  // públicas del artista.
  //
  // `expire: 0` = sin ventana de "sirve lo viejo mientras regenera". Para un
  // catálogo daría igual, pero acá el caso de uso es el artista que acaba de
  // publicar y abre su propio perfil para comprobarlo: si le servimos lo
  // anterior, para él el botón "Publicar" no funcionó.
  revalidateTag(etiquetaPerfil(limpio), { expire: 0 })
  revalidatePath(`/${limpio}`)
  revalidatePath(`/${limpio}/tienda`)
}

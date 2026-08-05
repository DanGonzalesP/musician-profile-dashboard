import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Protección de rutas en el BORDE, antes de renderizar nada.
//
// Antes toda la autorización vivía en un useEffect que hacía
// router.push("/login") DESPUÉS de montar el componente. Dos consecuencias:
// el HTML y el JS del panel se servían a cualquiera, y había un parpadeo
// visible de contenido protegido antes del redirect.
//
// Esto NO reemplaza a RLS: los datos siguen protegidos en la base. Es la
// primera barrera, no la única — que es exactamente como debe ser.

const RUTAS_PROTEGIDAS = ["/dashboard", "/perfil", "/grupo", "/cleanup"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const necesitaSesion = RUTAS_PROTEGIDAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  )
  if (!necesitaSesion) return NextResponse.next()

  // Se lee la sesión REAL desde las cookies con el cliente de @supabase/ssr,
  // en vez de solo comprobar que exista una cookie con nombre "sb-...". El
  // cliente de navegador (lib/supabase.ts) guarda la sesión en esas mismas
  // cookies, así que acá el edge la puede validar y refrescar. `setAll` deja
  // que Supabase renueve el token expirado escribiendo las cookies nuevas en
  // la respuesta — sin esto la sesión se caería sola al vencer el access token.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) return response

  // Se recuerda a dónde iba para devolverlo ahí después de iniciar sesión.
  const login = new URL("/login", request.url)
  login.searchParams.set("redirect", pathname)
  return NextResponse.redirect(login)
}

export const config = {
  // Se excluyen los archivos estáticos y las rutas de API: las de API validan
  // el token del header Authorization por su cuenta (ver lib/server-auth.ts),
  // no cookies.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
}

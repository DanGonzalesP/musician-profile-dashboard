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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const necesitaSesion = RUTAS_PROTEGIDAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  )
  if (!necesitaSesion) return NextResponse.next()

  // Supabase guarda la sesión en cookies con el prefijo "sb-". Acá solo se
  // comprueba que EXISTA una: validar la firma del JWT en el edge exigiría
  // traer el cliente de Supabase a cada request, y no aporta nada — quien
  // falsifique una cookie igual choca contra RLS en cuanto pida datos.
  const tieneSesion = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token") && cookie.value)

  if (tieneSesion) return NextResponse.next()

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

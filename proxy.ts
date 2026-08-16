import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { esRutaProtegida } from "@/lib/protected-routes"
import { crearCsp } from "@/lib/csp"

const aplicarCsp = (response: NextResponse, csp: string): NextResponse => {
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "")
  const csp = crearCsp(nonce, process.env.NODE_ENV === "development")
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const { pathname } = request.nextUrl
  if (!esRutaProtegida(pathname)) {
    return aplicarCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp)
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })
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
          // La renovación de Supabase muta las cookies de la request. Como
          // también inyectamos cabeceras CSP mediante una copia, hay que
          // reflejar aquí el Cookie actualizado; de lo contrario el render de
          // esta misma petición seguiría viendo el token antiguo.
          requestHeaders.set("cookie", request.cookies.toString())
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (user) return aplicarCsp(response, csp)

  const login = new URL("/login", request.url)
  login.searchParams.set("redirect", pathname)
  return aplicarCsp(NextResponse.redirect(login), csp)
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
}

// Qué rutas exigen sesión, en un solo lugar.
//
// Lo consume proxy.ts (la barrera en el borde) y se prueba de forma aislada,
// para que un cambio accidental en el prefijo —abrir /perfil al público, o
// dejar /dashboard sin cubrir— salte en rojo antes de llegar a producción.
//
// Ojo: esto NO es la única defensa. Los datos siguen protegidos por RLS en la
// base y las rutas de API validan su propio token (ver lib/server-auth.ts).
// Es la primera barrera, no la última.

export const RUTAS_PROTEGIDAS = ["/dashboard", "/perfil", "/grupo", "/cleanup"] as const

/**
 * True si la ruta pedida cae bajo un prefijo protegido. El límite se respeta
 * por segmento: "/perfil" y "/perfil/config" están protegidos, pero
 * "/perfilamiento" (que solo comparte prefijo de texto) NO lo está.
 */
export function esRutaProtegida(pathname: string): boolean {
  return RUTAS_PROTEGIDAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

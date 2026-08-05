import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente de navegador con la sesión guardada en COOKIES (no en localStorage).
//
// El middleware corre en el edge, donde no existe localStorage: solo puede
// leer cookies. Antes el cliente guardaba la sesión en localStorage, así que
// la cookie `sb-*-auth-token` nunca se escribía y el middleware rebotaba a
// /login TODAS las rutas protegidas (dashboard, perfil, grupo) aunque el
// usuario estuviera logueado — y el registro quedaba "colgado" porque el
// router.push("/dashboard") posterior rebotaba también.
//
// createBrowserClient de @supabase/ssr escribe la sesión en cookies que el
// middleware sí puede leer. Se mantiene el mismo nombre de export (`supabase`)
// y la misma API (.auth/.from/...), así que ninguno de los imports existentes
// cambia — solo cambia DÓNDE se guarda la sesión.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

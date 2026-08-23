// Arnés para las pruebas de base de datos.
//
// Estas pruebas son la pieza de mayor valor del plan (§F7): con RLS como única
// frontera de seguridad real, no tener una prueba que verifique "A no puede
// escribir el perfil de B" es el riesgo más silencioso del proyecto.
//
// ─── DOS REGLAS QUE NO SE NEGOCIAN ─────────────────────────────────────────
//
// 1. **Nunca contra producción.** `exigirEntornoLocal()` aborta si la URL no
//    es de una máquina local. Estas pruebas CREAN Y BORRAN usuarios; correrlas
//    contra la base real sería un incidente, no un fallo de pruebas.
//
// 2. **La service role NUNCA prueba lo que se está probando.** Se usa solo
//    para dos cosas administrativas: crear el usuario efímero y borrarlo al
//    final. Toda aserción de permisos se hace con un cliente que lleva el JWT
//    del usuario, porque es así como la app habla con la base. Probar con
//    service role sería probar que RLS se puede saltar, que ya lo sabemos.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const URL_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

function exigir(nombre: string): string {
  const v = process.env[nombre]
  if (!v) {
    throw new Error(
      [
        `Falta la variable ${nombre}.`,
        "",
        "Las pruebas de base de datos necesitan un Supabase LOCAL:",
        "  1. Abre Docker Desktop.",
        "  2. pnpm db:start   →  imprime la URL y las claves locales.",
        "  3. Cópialas a .env.local como SUPABASE_TEST_URL,",
        "     SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY.",
        "",
        "Ver .env.example y docs/migraciones.md.",
      ].join("\n")
    )
  }
  return v
}

/**
 * Aborta si la URL no es local. Es la salvaguarda que impide que un `.env.local`
 * mal copiado convierta la suite en un borrado de usuarios de producción.
 */
export function exigirEntornoLocal(): { url: string; anonKey: string; serviceKey: string } {
  const url = exigir("SUPABASE_TEST_URL")
  const origen = new URL(url).origin

  if (!URL_LOCAL.test(origen)) {
    throw new Error(
      [
        `SUPABASE_TEST_URL apunta a ${origen}, que no es una máquina local.`,
        "",
        "Estas pruebas CREAN Y BORRAN usuarios. Se niegan a correr contra",
        "cualquier cosa que no sea el Supabase local de `pnpm db:start`.",
      ].join("\n")
    )
  }

  return {
    url,
    anonKey: exigir("SUPABASE_TEST_ANON_KEY"),
    serviceKey: exigir("SUPABASE_TEST_SERVICE_ROLE_KEY"),
  }
}

/** Cliente anónimo: exactamente lo que tiene un visitante sin sesión. */
export function clienteAnonimo(): SupabaseClient {
  const { url, anonKey } = exigirEntornoLocal()
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Cliente administrativo. SOLO para crear y borrar los usuarios efímeros.
 * Si aparece dentro de una aserción, la prueba está mal escrita.
 */
export function clienteAdministrativo(): SupabaseClient {
  const { url, serviceKey } = exigirEntornoLocal()
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type UsuarioDePrueba = {
  id: string
  email: string
  /** Cliente con SU JWT: RLS se evalúa con su identidad real. */
  supabase: SupabaseClient
  /** Perfil creado para él, si se pidió. */
  profileId?: string
}

let contador = 0

/**
 * Crea un usuario efímero y devuelve un cliente que actúa en su nombre.
 * El correo lleva marca de tiempo y contador para que dos archivos que corren
 * seguidos no colisionen.
 */
export async function crearUsuario(opciones: { conPerfil?: boolean; nombre?: string } = {}): Promise<UsuarioDePrueba> {
  const { url, anonKey } = exigirEntornoLocal()
  const admin = clienteAdministrativo()

  const email = `prueba-${Date.now()}-${contador++}@ejemplo.local`
  const password = `Prueba-${Math.random().toString(36).slice(2)}-9!`

  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (errorCrear || !creado.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${errorCrear?.message}`)
  }

  // Se inicia sesión de verdad en vez de fabricar un token: así el JWT lleva
  // exactamente los claims que llevará en producción.
  const sesionCliente = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: sesion, error: errorSesion } = await sesionCliente.auth.signInWithPassword({ email, password })
  if (errorSesion || !sesion.session) {
    throw new Error(`No se pudo iniciar sesión con el usuario de prueba: ${errorSesion?.message}`)
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sesion.session.access_token}` } },
  })

  const usuario: UsuarioDePrueba = { id: creado.user.id, email, supabase }

  if (opciones.conPerfil !== false) {
    usuario.profileId = await crearPerfil(usuario, opciones.nombre)
  }

  return usuario
}

/**
 * Crea un perfil para el usuario, con su propio cliente (no con service role):
 * si RLS impidiera a un usuario crear su propio perfil, esta llamada fallaría,
 * y esa es información valiosa, no un estorbo.
 */
export async function crearPerfil(usuario: UsuarioDePrueba, nombre?: string): Promise<string> {
  const displayName = nombre ?? `Artista ${usuario.id.slice(0, 8)}`
  const username = `u${usuario.id.replace(/-/g, "").slice(0, 20)}`

  const { data, error } = await usuario.supabase
    .from("profiles")
    .insert({ user_id: usuario.id, display_name: displayName, username })
    .select("id")
    .single()

  if (error) throw new Error(`No se pudo crear el perfil de prueba: ${error.message}`)
  return data.id as string
}

/**
 * Crea una pista en el feed musical del perfil del usuario, con su propio
 * cliente. Es el fixture de `rls-feed-y-comentarios`: sin una pista real no se
 * puede probar que B no borra la música de A.
 */
export async function crearPista(usuario: UsuarioDePrueba, titulo = "Pista de prueba"): Promise<string> {
  const { data, error } = await usuario.supabase
    .from("music_feed")
    .insert({
      profile_id: usuario.profileId,
      title: titulo,
      audio_url: `https://ejemplo.local/audio/${crypto.randomUUID()}.mp3`,
    })
    .select("id")
    .single()

  if (error) throw new Error(`No se pudo crear la pista de prueba: ${error.message}`)
  return data.id as string
}

/** Clave de R2 única por llamada: dos corridas seguidas nunca colisionan. */
export function claveDeMedio(carpeta: "images" | "audio" | "video" = "images"): string {
  return `${carpeta}/${crypto.randomUUID()}.bin`
}

/**
 * Junta todo el texto que trae un error de PostgREST. `message` suele bastar,
 * pero según de dónde venga el rechazo (excepción de plpgsql, restricción
 * `check`, política de RLS) el texto útil cae en `details` o en `hint`.
 */
export function mensajeDeError(error: unknown): string {
  if (!error) return ""
  const e = error as { message?: string; details?: string; hint?: string; code?: string }
  return [e.code, e.message, e.details, e.hint].filter(Boolean).join(" | ")
}

/**
 * Borra los usuarios efímeros y los perfiles que cuelgan de ellos.
 *
 * El borrado del perfil es explícito y no una cascada: `profiles.user_id` no
 * tiene clave foránea contra `auth.users` (sólo `owner_user_id` la tiene), así
 * que borrar la cuenta dejaría el perfil individual huérfano. Es exactamente el
 * desajuste que `0013` documenta en `eliminar_mi_cuenta_impl`. Todo lo demás
 * —bloques, pistas, comentarios, archivos— sí cae por los ON DELETE CASCADE.
 */
export async function limpiarUsuarios(...usuarios: (UsuarioDePrueba | undefined)[]): Promise<void> {
  const admin = clienteAdministrativo()
  for (const u of usuarios) {
    if (!u) continue
    await admin.from("profiles").delete().or(`user_id.eq.${u.id},owner_user_id.eq.${u.id}`)
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
}

/** Azúcar: `esperarFallo(promesa)` afirma que la operación fue rechazada. */
export async function esperarErrorDeRls(
  operacion: PromiseLike<{ error: unknown; data: unknown }>
): Promise<void> {
  const { error, data } = await operacion
  // PostgREST responde de dos formas a un rechazo de RLS según la operación:
  // un error explícito, o 0 filas afectadas (el `select` no ve nada). Las dos
  // cuentan como "no pudo".
  const filas = Array.isArray(data) ? data.length : data == null ? 0 : 1
  if (!error && filas > 0) {
    throw new Error(`Se esperaba que RLS rechazara la operación, pero devolvió ${filas} fila(s).`)
  }
}

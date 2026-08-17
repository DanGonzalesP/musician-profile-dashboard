import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  clienteAnonimo,
  crearUsuario,
  limpiarUsuarios,
  mensajeDeError,
  type UsuarioDePrueba,
} from "./helpers"

// Anti-abuso en la base (0009 + 0011).
//
// El contador de la aplicación sólo cubre 4 rutas serverless. Comentarios,
// preguntas, reportes y bloqueos se escriben DIRECTO contra PostgREST: ningún
// contador de Node los ve nunca. Por eso el límite vive en un trigger.
//
// Estas pruebas cubren las dos mitades:
//   • `consume_authenticated_rate_limit` (0009/0013) — el contador distribuido
//     de las rutas de API, incluida su corrección bajo concurrencia (el bug que
//     0009 arregló: dos primeras peticiones simultáneas del mismo usuario
//     reventaban con unique_violation).
//   • Los triggers de escritura (0011) — que cortan donde deben y que no se
//     pueden evadir mintiendo en las columnas que manda el cliente.
//
// Todos los sujetos son usuarios efímeros: cada corrida arranca con la ventana
// vacía, así que el resultado no depende de cuántas veces se corrió la suite.

/** Cupos declarados en la base. Si cambian allí, esta prueba tiene que cambiar. */
const CUPO_IMAGEN = 10 // private.consume_authenticated_rate_limit, bucket image-generation
const CUPO_REPORTES = 15 // trigger `limite_escritura` sobre content_reports
const CUPO_COMENTARIOS = 90 // trigger `limite_escritura` sobre feed_post_comments

type Veredicto = { is_allowed: boolean; retry_after: number }

async function consumir(usuario: UsuarioDePrueba, bucket = "image-generation") {
  const { data, error } = await usuario.supabase.rpc("consume_authenticated_rate_limit", {
    p_bucket: bucket,
  })
  return { veredicto: (data as Veredicto[] | null)?.[0], error }
}

describe("Límites · contador distribuido (0009/0013)", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Límites", conPerfil: false })
    beto = await crearUsuario({ nombre: "Beto Límites", conPerfil: false })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  it("un visitante sin sesión no puede consumir cuota", async () => {
    const { error } = await clienteAnonimo().rpc("consume_authenticated_rate_limit", {
      p_bucket: "image-generation",
    })
    expect(error).toBeTruthy()
  })

  it("agota su cupo y recibe un retry_after útil", async () => {
    for (let i = 1; i <= CUPO_IMAGEN; i++) {
      const { veredicto, error } = await consumir(ana)
      expect(error, mensajeDeError(error)).toBeNull()
      expect(veredicto?.is_allowed, `la petición ${i} debería estar permitida`).toBe(true)
    }

    const { veredicto } = await consumir(ana)
    expect(veredicto?.is_allowed).toBe(false)
    expect(veredicto?.retry_after).toBeGreaterThan(0)
  })

  it("nadie consume la cuota de otro", async () => {
    // Ana quedó topada arriba. El sujeto sale de auth.uid(), no de nada que el
    // cliente pueda mandar, así que Beto arranca con su ventana intacta.
    const { veredicto, error } = await consumir(beto)
    expect(error).toBeNull()
    expect(veredicto?.is_allowed).toBe(true)
  })

  it("los cupos de dos buckets no se mezclan", async () => {
    const { veredicto, error } = await consumir(ana, "upload")
    expect(error).toBeNull()
    expect(veredicto?.is_allowed).toBe(true)
  })

  it("bajo concurrencia se conceden exactamente las del cupo, sin errores", async () => {
    // El UPSERT atómico de 0009 tiene que aguantar N peticiones simultáneas de
    // un usuario cuya ventana AÚN NO EXISTE: es el caso que FOR UPDATE no
    // cubría y que reventaba con unique_violation.
    const carla = await crearUsuario({ nombre: "Carla Límites", conPerfil: false })

    try {
      const resultados = await Promise.all(
        Array.from({ length: CUPO_IMAGEN + 2 }, () => consumir(carla))
      )

      const errores = resultados.map((r) => r.error).filter(Boolean)
      expect(errores.map(mensajeDeError)).toEqual([])

      const permitidas = resultados.filter((r) => r.veredicto?.is_allowed === true).length
      expect(permitidas).toBe(CUPO_IMAGEN)
    } finally {
      await limpiarUsuarios(carla)
    }
  })
})

describe("Límites · triggers de escritura (0011)", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba

  const reporte = (perfil: string, i: number) => ({
    reporter_user_id: null as string | null,
    reported_profile_id: perfil,
    target_type: "perfil",
    reason: "spam_o_estafa",
    details: `Reporte automatizado número ${i} de la prueba de límites.`,
  })

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Triggers" })
    beto = await crearUsuario({ nombre: "Beto Triggers" })
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("reportes", () => {
    it("el cupo entero pasa y el siguiente es rechazado", async () => {
      const objetivo = beto.profileId!

      // El trigger es BEFORE INSERT FOR EACH ROW: un insert de N filas lo
      // dispara N veces, así que el conteo es el mismo que con N peticiones.
      const lote = Array.from({ length: CUPO_REPORTES - 1 }, (_, i) => ({
        ...reporte(objetivo, i + 1),
        reporter_user_id: ana.id,
      }))
      const { error: errorLote } = await ana.supabase.from("content_reports").insert(lote)
      expect(errorLote, mensajeDeError(errorLote)).toBeNull()

      const { error: enElLimite } = await ana.supabase
        .from("content_reports")
        .insert({ ...reporte(objetivo, CUPO_REPORTES), reporter_user_id: ana.id })
      expect(enElLimite, mensajeDeError(enElLimite)).toBeNull()

      const { error: pasado } = await ana.supabase
        .from("content_reports")
        .insert({ ...reporte(objetivo, CUPO_REPORTES + 1), reporter_user_id: ana.id })
      expect(pasado).toBeTruthy()
      expect(mensajeDeError(pasado)).toContain("limite_de_escritura")
    })

    it("no se evade dejando el reportante en null", async () => {
      // La columna la manda el cliente; el sujeto del contador sale de
      // auth.uid(). Nullificarla no devuelve cupo.
      const { error } = await ana.supabase
        .from("content_reports")
        .insert(reporte(beto.profileId!, 99))
      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("limite_de_escritura")
    })

    it("no se evade declarando otro correo", async () => {
      const { error } = await ana.supabase.from("content_reports").insert({
        ...reporte(beto.profileId!, 100),
        reporter_email: `evasion-${crypto.randomUUID()}@ejemplo.local`,
      })
      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("limite_de_escritura")
    })

    it("el cupo es de cada usuario: B reporta con normalidad", async () => {
      const { error } = await beto.supabase.from("content_reports").insert({
        ...reporte(ana.profileId!, 1),
        reporter_user_id: beto.id,
      })
      expect(error, mensajeDeError(error)).toBeNull()
    })
  })

  describe("comentarios de publicaciones", () => {
    let carla: UsuarioDePrueba
    const publicacion = `publicacion-${crypto.randomUUID()}`

    beforeAll(async () => {
      carla = await crearUsuario({ nombre: "Carla Triggers" })
    })

    afterAll(async () => {
      await limpiarUsuarios(carla)
    })

    it("el comentario del cupo pasa y el siguiente es rechazado", async () => {
      const comentario = (i: number) => ({
        post_id: publicacion,
        user_id: carla.id,
        content: `Comentario ${i} de la prueba de límites`,
      })

      const lote = Array.from({ length: CUPO_COMENTARIOS - 1 }, (_, i) => comentario(i + 1))
      const { error: errorLote } = await carla.supabase.from("feed_post_comments").insert(lote)
      expect(errorLote, mensajeDeError(errorLote)).toBeNull()

      const { error: enElLimite } = await carla.supabase
        .from("feed_post_comments")
        .insert(comentario(CUPO_COMENTARIOS))
      expect(enElLimite, mensajeDeError(enElLimite)).toBeNull()

      const { error: pasado } = await carla.supabase
        .from("feed_post_comments")
        .insert(comentario(CUPO_COMENTARIOS + 1))
      expect(pasado).toBeTruthy()
      expect(mensajeDeError(pasado)).toContain("limite_de_escritura")
    })

    it("el rechazo no deja el comentario a medias", async () => {
      const { data } = await clienteAnonimo()
        .from("feed_post_comments")
        .select("id")
        .eq("post_id", publicacion)
      expect(data ?? []).toHaveLength(CUPO_COMENTARIOS)
    })
  })

  describe("el contador no se puede tocar", () => {
    it("nadie lee ni borra las ventanas de escritura", async () => {
      // Si alguien pudiera borrar sus propias filas, el límite sería
      // decorativo. La tabla no tiene ninguna política a propósito.
      for (const cliente of [ana.supabase, clienteAnonimo()]) {
        const { data, error } = await cliente.from("write_rate_limit_windows").select("*").limit(1)
        expect(error ? true : (data ?? []).length === 0).toBe(true)
      }

      await ana.supabase.from("write_rate_limit_windows").delete().neq("bucket", "")

      // Se comprueba por conducta: si el borrado hubiera funcionado, Ana
      // volvería a poder reportar.
      const { error } = await ana.supabase
        .from("content_reports")
        .insert({ ...reporte(beto.profileId!, 101), reporter_user_id: ana.id })
      expect(error).toBeTruthy()
      expect(mensajeDeError(error)).toContain("limite_de_escritura")
    })

    it("las funciones del límite no son invocables desde el cliente", async () => {
      const intentos = [
        ana.supabase.rpc("check_write_rate_limit", {
          p_bucket: "reportes",
          p_sujeto: `user:${ana.id}`,
          p_limit: 999999,
          p_window_seconds: 1,
        }),
        ana.supabase.rpc("podar_write_rate_limits"),
        ana.supabase.rpc("aplicar_limite_de_escritura"),
        clienteAnonimo().rpc("podar_write_rate_limits"),
      ]

      for (const intento of intentos) {
        const { error } = await intento
        expect(error).toBeTruthy()
      }
    })
  })
})

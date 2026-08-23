import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  clienteAnonimo,
  crearPista,
  crearUsuario,
  limpiarUsuarios,
  type UsuarioDePrueba,
} from "./helpers"

// El feed es lo único de Vibe que se lee sin sesión y se escribe con ella. Tres
// agujeros de la auditoría viven acá:
//
//   • `deleteTrackFromFeed` borra por id SIN comprobar dueño: la única defensa
//     posible es la RLS de `music_feed` (0004).
//   • `author_name` / `asker_display_name` los mandaba el cliente: nada impedía
//     firmar un comentario con el nombre de otro artista. Ahora los escribe un
//     trigger a partir del perfil real de quien comenta (0004).
//   • La lista de bloqueos es la que alimenta el filtro del feed
//     (`fetchPerfilesBloqueados`). Si esa lista se pudiera leer o escribir a
//     nombre de otro, el filtro sería decorativo.

describe("RLS · feed, comentarios y bloqueos", () => {
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  /** Pista de Ana, el objeto sobre el que se prueba todo el feed. */
  let pistaDeAna: string

  beforeAll(async () => {
    ana = await crearUsuario({ nombre: "Ana Feed" })
    beto = await crearUsuario({ nombre: "Beto Feed" })
    pistaDeAna = await crearPista(ana, "Canción de Ana")
  })

  afterAll(async () => {
    await limpiarUsuarios(ana, beto)
  })

  describe("music_feed — lectura pública, escritura del dueño", () => {
    it("un visitante sin sesión lee la pista (el feed es público a propósito)", async () => {
      const { data, error } = await clienteAnonimo()
        .from("music_feed")
        .select("id, title")
        .eq("id", pistaDeAna)
        .single()

      expect(error).toBeNull()
      expect(data?.title).toBe("Canción de Ana")
    })

    it("B NO puede borrar la música de A", async () => {
      // Ésta es la prueba de `deleteTrackFromFeed`: el borrado por id sin
      // comprobación de dueño llega a la base tal cual.
      await beto.supabase.from("music_feed").delete().eq("id", pistaDeAna)

      const { data } = await clienteAnonimo().from("music_feed").select("id").eq("id", pistaDeAna)
      expect(data ?? []).toHaveLength(1)
    })

    it("B NO puede editar la pista de A", async () => {
      await beto.supabase
        .from("music_feed")
        .update({ title: "Secuestrada por Beto" })
        .eq("id", pistaDeAna)

      const { data } = await clienteAnonimo()
        .from("music_feed")
        .select("title")
        .eq("id", pistaDeAna)
        .single()
      expect(data?.title).toBe("Canción de Ana")
    })

    it("B NO puede colgar una pista en el perfil de A", async () => {
      const { error } = await beto.supabase.from("music_feed").insert({
        profile_id: ana.profileId,
        title: "Pista intrusa",
        audio_url: "https://ejemplo.local/audio/intrusa.mp3",
      })
      expect(error).toBeTruthy()

      const { data } = await clienteAnonimo()
        .from("music_feed")
        .select("id")
        .eq("profile_id", ana.profileId!)
      expect(data ?? []).toHaveLength(1)
    })

    it("anon no puede escribir en el feed", async () => {
      const { error } = await clienteAnonimo().from("music_feed").insert({
        profile_id: ana.profileId,
        title: "Pista anónima",
        audio_url: "https://ejemplo.local/audio/anonima.mp3",
      })
      expect(error).toBeTruthy()
    })

    it("A sí borra su propia pista", async () => {
      const desechable = await crearPista(ana, "Pista desechable")

      const { error } = await ana.supabase.from("music_feed").delete().eq("id", desechable)
      expect(error).toBeNull()

      const { data } = await clienteAnonimo().from("music_feed").select("id").eq("id", desechable)
      expect(data ?? []).toHaveLength(0)
    })
  })

  describe("feed_comments — nadie firma con el nombre de otro", () => {
    it("el nombre del autor lo pone la base, no el cliente", async () => {
      const { data, error } = await beto.supabase
        .from("feed_comments")
        .insert({
          track_id: pistaDeAna,
          user_id: beto.id,
          author_name: "Ana Feed", // suplantación deliberada
          content: "Comentario firmado con el nombre de otra artista",
        })
        .select("id, author_name")
        .single()

      expect(error).toBeNull()
      expect(data?.author_name).toBe("Beto Feed")
    })

    it("B NO puede comentar en nombre de A", async () => {
      const { error } = await beto.supabase.from("feed_comments").insert({
        track_id: pistaDeAna,
        user_id: ana.id,
        content: "Comentario atribuido a Ana",
      })
      expect(error).toBeTruthy()
    })

    it("un comentario propio no se puede renombrar después", async () => {
      // No hay política de UPDATE en feed_comments: el nombre queda fijado por
      // el trigger en el insert y nadie lo reescribe.
      const { data: creado } = await beto.supabase
        .from("feed_comments")
        .insert({ track_id: pistaDeAna, user_id: beto.id, content: "Comentario que se intentará renombrar" })
        .select("id")
        .single()

      await beto.supabase
        .from("feed_comments")
        .update({ author_name: "Ana Feed" })
        .eq("id", creado!.id)

      const { data } = await clienteAnonimo()
        .from("feed_comments")
        .select("author_name")
        .eq("id", creado!.id)
        .single()
      expect(data?.author_name).toBe("Beto Feed")
    })

    it("anon puede leer los comentarios pero no escribirlos", async () => {
      const anon = clienteAnonimo()

      const { data, error } = await anon
        .from("feed_comments")
        .select("id, content")
        .eq("track_id", pistaDeAna)
      expect(error).toBeNull()
      expect((data ?? []).length).toBeGreaterThan(0)

      const { error: errorEscritura } = await anon.from("feed_comments").insert({
        track_id: pistaDeAna,
        user_id: ana.id,
        content: "Comentario sin sesión",
      })
      expect(errorEscritura).toBeTruthy()
    })

    it("A NO puede borrar el comentario de B, pero B sí borra el suyo", async () => {
      const { data: creado } = await beto.supabase
        .from("feed_comments")
        .insert({ track_id: pistaDeAna, user_id: beto.id, content: "Comentario que Ana intentará borrar" })
        .select("id")
        .single()

      // Ana es la dueña de la pista, y aun así no manda sobre el comentario.
      await ana.supabase.from("feed_comments").delete().eq("id", creado!.id)
      const { data: sigue } = await clienteAnonimo()
        .from("feed_comments")
        .select("id")
        .eq("id", creado!.id)
      expect(sigue ?? []).toHaveLength(1)

      const { error } = await beto.supabase.from("feed_comments").delete().eq("id", creado!.id)
      expect(error).toBeNull()
      const { data: borrado } = await clienteAnonimo()
        .from("feed_comments")
        .select("id")
        .eq("id", creado!.id)
      expect(borrado ?? []).toHaveLength(0)
    })
  })

  describe("feed_post_comments — la misma regla en las publicaciones", () => {
    const publicacion = `publicacion-${crypto.randomUUID()}`

    it("el nombre del autor lo pone la base, no el cliente", async () => {
      const { data, error } = await beto.supabase
        .from("feed_post_comments")
        .insert({
          post_id: publicacion,
          user_id: beto.id,
          author_name: "Ana Feed",
          content: "Comentario de publicación firmado con nombre ajeno",
        })
        .select("author_name")
        .single()

      expect(error).toBeNull()
      expect(data?.author_name).toBe("Beto Feed")
    })

    it("B NO puede comentar una publicación en nombre de A", async () => {
      const { error } = await beto.supabase.from("feed_post_comments").insert({
        post_id: publicacion,
        user_id: ana.id,
        content: "Comentario de publicación atribuido a Ana",
      })
      expect(error).toBeTruthy()
    })
  })

  describe("profile_questions — la pregunta es del dueño del perfil", () => {
    let preguntaDeBeto: string

    beforeAll(async () => {
      // Sin `.select()` a propósito: quien pregunta no puede leer la fila que
      // acaba de escribir (la política de lectura es sólo para el dueño del
      // perfil), y un RETURNING obligaría a la base a rechazar el insert.
      const { error } = await beto.supabase.from("profile_questions").insert({
        profile_id: ana.profileId,
        asker_user_id: beto.id,
        asker_display_name: "Ana Feed", // suplantación deliberada
        block_type: "service",
        block_label: "Sesión de grabación",
        message: "¿Cuánto cuesta una sesión?",
      })
      expect(error).toBeNull()

      const { data } = await ana.supabase
        .from("profile_questions")
        .select("id")
        .eq("profile_id", ana.profileId!)
        .single()
      preguntaDeBeto = data!.id as string
    })

    it("sólo el dueño del perfil lee las preguntas que le hicieron, y el nombre lo pone la base", async () => {
      const { data, error } = await ana.supabase
        .from("profile_questions")
        .select("id, message, asker_display_name")
        .eq("id", preguntaDeBeto)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0]?.asker_display_name).toBe("Beto Feed")
    })

    it("ni quien preguntó ni un anónimo leen la bandeja de A", async () => {
      const { data: comoBeto } = await beto.supabase
        .from("profile_questions")
        .select("id")
        .eq("id", preguntaDeBeto)
      expect(comoBeto ?? []).toHaveLength(0)

      const { data: comoAnon, error } = await clienteAnonimo()
        .from("profile_questions")
        .select("id")
        .eq("id", preguntaDeBeto)
      expect(error ? true : (comoAnon ?? []).length === 0).toBe(true)
    })

    it("B NO puede preguntar firmando como A", async () => {
      const { error } = await beto.supabase.from("profile_questions").insert({
        profile_id: ana.profileId,
        asker_user_id: ana.id,
        block_type: "service",
        block_label: "Sesión de grabación",
        message: "Pregunta atribuida a Ana",
      })
      expect(error).toBeTruthy()
    })

    it("sólo el dueño marca la pregunta como leída", async () => {
      await beto.supabase.from("profile_questions").update({ status: "read" }).eq("id", preguntaDeBeto)

      const { data: sinCambios } = await ana.supabase
        .from("profile_questions")
        .select("status")
        .eq("id", preguntaDeBeto)
        .single()
      expect(sinCambios?.status).toBe("unread")

      const { error } = await ana.supabase
        .from("profile_questions")
        .update({ status: "read" })
        .eq("id", preguntaDeBeto)
      expect(error).toBeNull()

      const { data } = await ana.supabase
        .from("profile_questions")
        .select("status")
        .eq("id", preguntaDeBeto)
        .single()
      expect(data?.status).toBe("read")
    })
  })

  describe("user_blocks — la lista que filtra el feed es estrictamente propia", () => {
    beforeAll(async () => {
      const { error } = await ana.supabase
        .from("user_blocks")
        .insert({ blocker_user_id: ana.id, blocked_profile_id: beto.profileId })
      expect(error).toBeNull()
    })

    it("A ve su propio bloqueo (es lo que fetchPerfilesBloqueados devuelve)", async () => {
      const { data, error } = await ana.supabase.from("user_blocks").select("blocked_profile_id")

      expect(error).toBeNull()
      expect((data ?? []).map((f) => f.blocked_profile_id)).toEqual([beto.profileId])
    })

    it("B no se entera de que A lo bloqueó", async () => {
      // Exponer quién bloqueó a quién invita a represalias, igual que con los
      // reportes.
      const { data } = await beto.supabase.from("user_blocks").select("*")
      expect(data ?? []).toHaveLength(0)

      const { data: anonimo, error } = await clienteAnonimo().from("user_blocks").select("*").limit(1)
      expect(error ? true : (anonimo ?? []).length === 0).toBe(true)
    })

    it("B NO puede deshacer el bloqueo de A", async () => {
      await beto.supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_user_id", ana.id)
        .eq("blocked_profile_id", beto.profileId!)

      const { data } = await ana.supabase.from("user_blocks").select("blocked_profile_id")
      expect((data ?? []).map((f) => f.blocked_profile_id)).toEqual([beto.profileId])
    })

    it("B NO puede bloquear a nadie a nombre de A", async () => {
      const { error } = await beto.supabase
        .from("user_blocks")
        .insert({ blocker_user_id: ana.id, blocked_profile_id: ana.profileId })
      expect(error).toBeTruthy()

      const { data } = await ana.supabase.from("user_blocks").select("blocked_profile_id")
      expect((data ?? []).map((f) => f.blocked_profile_id)).toEqual([beto.profileId])
    })
  })
})

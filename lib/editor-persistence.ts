import { supabase } from "./supabase"
import { validarLoteDePublicacion, type BloqueParaPersistir } from "./blocks-schema"
import { productFullPayload, serviceFullPayload, type CatalogProduct, type CatalogService } from "./catalog"
import { sanitizeUrlFields } from "./safe-url"
import type { DraftContent } from "./draft"
import { rewriteMediaUrls } from "./media-url"

export type EditorState = { content_version: number; draft_revision: number; draft_content: DraftContent | null }
const CONFLICT = "El perfil cambió en otra sesión. Conserva una copia de tus cambios antes de recargar; no vuelvas a guardar o publicar desde esta versión."

/** Mensajes definidos aquí; nunca detalles recibidos de Postgres o de la red. */
export class EditorPersistenceError extends Error {}

function persistenceError(error: { code?: string; message?: string } | null): Error {
  return new EditorPersistenceError(error?.code === "PT409" || error?.message?.includes("conflicto_de_version")
    ? CONFLICT : "No se pudo confirmar el guardado. Mantén el editor abierto y conserva una copia de tus cambios antes de recargar y revisar qué quedó guardado.")
}

export async function readEditorState(profileId: string, accessToken?: string): Promise<EditorState> {
  const query = supabase.rpc("read_profile_editor", { p_profile_id: profileId })
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`)
  const { data, error } = await query
  if (error || !data || !Number.isInteger(data.content_version) || !Number.isInteger(data.draft_revision)) {
    throw new EditorPersistenceError("No se pudo cargar el borrador. Recarga la página antes de editar.")
  }
  return rewriteMediaUrls(data as EditorState)
}

// Una cola por instancia del editor. No hay estado compartido entre pestañas:
// la base compara ambas revisiones y rechaza a la que parta de datos obsoletos.
export class EditorPersistence {
  private tail: Promise<unknown> = Promise.resolve()
  private failure: Error | null = null
  private catalogBaseVersion: number | null
  constructor(private profileId: string, private state: EditorState, private ownerUserId: string) {
    // Reopening an older draft must not silently approve its catalog against
    // the newest published version. Missing provenance needs reconciliation.
    this.catalogBaseVersion = state.draft_content
      ? (Number.isInteger(state.draft_content.catalog_base_version) ? state.draft_content.catalog_base_version! : null)
      : state.content_version
  }

  private enqueue<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      if (this.failure) throw this.failure
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error || !data.session || data.session.user.id !== this.ownerUserId) {
          throw new EditorPersistenceError("La cuenta cambió. Conserva tus cambios y vuelve a abrir el editor con la cuenta original.")
        }
        // Fijar el JWT de esta operación evita que el fetch tome el de otra
        // cuenta si la sesión cambia entre la comprobación y el envío.
        return await operation(data.session.access_token)
      } catch (error) {
        // Una respuesta perdida pudo confirmar una escritura. No se inventa
        // una revisión ni se sobreescribe otra pestaña releyendo automáticamente.
        this.failure = error instanceof EditorPersistenceError ? error : persistenceError(null)
        throw this.failure
      }
    })
    this.tail = next.catch(() => {})
    return next
  }

  save(draft: DraftContent): Promise<void> {
    return this.persistDraft(draft, this.catalogBaseVersion)
  }

  /** Only after an explicit choice between the displayed draft and live catalog. */
  reconcileCatalog(draft: DraftContent): Promise<void> {
    return this.persistDraft(draft, this.state.content_version)
  }

  private persistDraft(draft: DraftContent, catalogBaseVersion: number | null): Promise<void> {
      const blocks = (draft.blocks ?? []).map((value, index) => {
        const block = value as { type?: unknown; data?: unknown }
        return { block_type: block.type, position_index: index, content: block.data }
      })
      if (!validarLoteDePublicacion(blocks).ok) return Promise.reject(new EditorPersistenceError("No se pudo guardar: hay un bloque con formato inválido."))
    return this.enqueue(async accessToken => {
      const { data, error } = await supabase.rpc("save_profile_draft", {
        p_profile_id: this.profileId,
        p_draft: sanitizeUrlFields({ ...draft, catalog_base_version: catalogBaseVersion }),
        p_expected_revision: this.state.draft_revision,
        p_expected_version: this.state.content_version,
      }).setHeader("Authorization", `Bearer ${accessToken}`)
      if (error || !Number.isInteger(data)) throw persistenceError(error)
      this.state = { ...this.state, draft_revision: data }
      this.catalogBaseVersion = catalogBaseVersion
    })
  }

  publish(blocks: BloqueParaPersistir[], products: CatalogProduct[], services: CatalogService[]): Promise<void> {
    if (!validarLoteDePublicacion(blocks).ok) return Promise.reject(new EditorPersistenceError("No se pudo publicar: hay un bloque con formato inválido."))
    if (this.catalogBaseVersion !== this.state.content_version) {
      return Promise.reject(new EditorPersistenceError("El catálogo de este borrador necesita compararse con la tienda actual antes de publicar. Conservamos el borrador y tus cambios."))
    }
    return this.enqueue(async accessToken => {
      const { data, error } = await supabase.rpc("publish_profile_complete", {
        p_profile_id: this.profileId,
        p_blocks: blocks,
        p_products: sanitizeUrlFields(products.map((p, i) => productFullPayload(p, this.profileId, i))),
        p_services: sanitizeUrlFields(services.map((s, i) => serviceFullPayload(s, this.profileId, i))),
        p_expected_version: this.state.content_version,
        p_expected_revision: this.state.draft_revision,
      }).setHeader("Authorization", `Bearer ${accessToken}`)
      if (error || !data || !Number.isInteger(data.content_version) || !Number.isInteger(data.draft_revision)) {
        throw persistenceError(error)
      }
      this.state = { ...data, draft_content: null }
      this.catalogBaseVersion = data.content_version
    })
  }
}

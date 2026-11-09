import type { Block } from "./blocks"
import type { CatalogProduct, CatalogService } from "./catalog"

/** Copia de consulta, sin credenciales, peticiones ni binarios incorporados. */
export function createEditorCopy(
  content: { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] },
  files: Map<string, File>,
) {
  const references = new Map<string, string>()
  const pendingFiles: { reference: string; name: string | null; type: string | null; size: number | null; availableInTab: boolean }[] = []
  const snapshot = JSON.parse(JSON.stringify(content, (_key, value: unknown) => {
    if (typeof value !== "string" || !value.startsWith("blob:")) return value
    let reference = references.get(value)
    if (!reference) {
      reference = `local-file:${references.size + 1}`
      references.set(value, reference)
      const file = files.get(value)
      pendingFiles.push({ reference, name: file?.name ?? null, type: file?.type ?? null,
        size: file?.size ?? null, availableInTab: Boolean(file) })
    }
    return reference
  })) as typeof content
  return {
    format: "vibe-editor-reference-copy",
    version: 1,
    createdAt: new Date().toISOString(),
    instructions: [
      "Copia de textos, estructura y catálogo para consultar o recuperar manualmente los cambios.",
      "No incluye archivos de audio ni imágenes, publicados o pendientes. Conserva los originales.",
      "Las referencias local-file corresponden al listado pendingFiles; no son enlaces descargables.",
      "No confirma que el borrador esté guardado o publicado. No dispone de importación automática.",
    ],
    content: snapshot,
    pendingFiles,
  }
}

import type { DbProfileBlock } from "@/lib/blocks"

// El RPC coteja datos publicados con la solicitud real. El consumidor vuelve
// a comparar el contenido cargado para no aceptar otro rol/canción por ID.
export function applyPublicCreditApprovals(rows: DbProfileBlock[], approvals: unknown): DbProfileBlock[] {
  const verified = Array.isArray(approvals) ? approvals.filter(
    (value): value is Record<string, unknown> => {
      if (!value || typeof value !== "object") return false
      const row = value as Record<string, unknown>
      return ["request_id", "credit_id", "owner_profile_id", "song_key", "song_title", "role"]
        .every(key => typeof row[key] === "string" && row[key].length > 0)
    },
  ) : []
  return rows.map(row => {
    if (row.block_type !== "credits") return row
    const content = row.content && typeof row.content === "object"
      ? row.content as Record<string, unknown> : {}
    const credits = Array.isArray(content.credits) ? content.credits : []
    return { ...row, content: { ...content, credits: credits.flatMap(value => {
      if (!value || typeof value !== "object") return []
      const credit = value as Record<string, unknown>
      // Créditos externos históricos conservan su comportamiento.
      if (credit.sourceType !== "internal") return [credit]
      const accepted = verified.some(approval =>
        approval.request_id === credit.requestId && approval.credit_id === credit.id &&
        approval.owner_profile_id === credit.ownerProfileId && approval.song_key === credit.songKey &&
        approval.song_title === credit.title && approval.role === credit.role)
      return accepted ? [{ ...credit, status: "accepted" }] : []
    }) } }
  })
}
